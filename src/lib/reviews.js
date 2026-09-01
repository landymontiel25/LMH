import {
  doc,
  getDoc,
  getDocs,
  runTransaction,
  collection,
  query,
  where,
  limit,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

// Reject after `ms` so a stalled Storage upload (bucket not enabled, blocked by
// rules, CORS, or just slow) can never hang the whole save forever.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), ms)),
  ]);
}

/**
 * Submit (or update) a user's star rating for a landmark. Gated on having a
 * check-in for that landmark. Keeps a running aggregate in `landmark_ratings`
 * so average + count are cheap to read. Editing your rating adjusts the sum by
 * the delta rather than double-counting. An optional selfie/photo is uploaded
 * to Storage and its URL saved on the review.
 */
export async function submitReview({ userId, userName, landmark, stars, comment = '', photoFiles, photoFile }) {
  const landmarkId = landmark.id;

  // Must have checked in here first.
  const checkin = await getDoc(doc(db, 'checkins', `${userId}_${landmarkId}`));
  if (!checkin.exists()) {
    throw new Error('Check in at this landmark first to leave a rating.');
  }

  // Up to 3 photos. Accepts an array (photoFiles) or a single file (photoFile).
  const files = (photoFiles && photoFiles.length ? photoFiles : photoFile ? [photoFile] : [])
    .filter(Boolean)
    .slice(0, 3);
  const photoURLs = [];
  let photoFailed = false;
  if (files.length && storage) {
    for (let i = 0; i < files.length; i++) {
      try {
        const path = `review_photos/${landmarkId}/${userId}_${i}.jpg`;
        const storageRef = ref(storage, path);
        await withTimeout(uploadBytes(storageRef, files[i], { contentType: files[i].type || 'image/jpeg' }), 20000);
        photoURLs.push(await withTimeout(getDownloadURL(storageRef), 10000));
      } catch {
        // A stalled/failed upload never blocks the rating from saving.
        photoFailed = true;
      }
    }
  }

  const reviewRef = doc(db, 'reviews', `${userId}_${landmarkId}`);
  const aggRef = doc(db, 'landmark_ratings', landmarkId);

  await runTransaction(db, async (tx) => {
    const prev = await tx.get(reviewRef);
    const agg = await tx.get(aggRef);
    const prevStars = prev.exists() ? prev.data().stars || 0 : 0;
    const hadReview = prev.exists();
    const curSum = agg.exists() ? agg.data().sum || 0 : 0;
    const curCount = agg.exists() ? agg.data().count || 0 : 0;
    const newSum = curSum - prevStars + stars;
    const newCount = curCount + (hadReview ? 0 : 1);

    tx.set(
      aggRef,
      { landmarkId, sum: newSum, count: newCount, avg: newCount ? newSum / newCount : 0, updatedAt: serverTimestamp() },
      { merge: true }
    );
    tx.set(
      reviewRef,
      {
        userId,
        userName,
        landmarkId,
        landmarkName: landmark.name,
        region: landmark.region,
        stars,
        comment: (comment || '').slice(0, 500),
        ...(photoURLs.length ? { photoURLs } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { photoURLs, photoFailed };
}

/** All of a user's review photos, as { [landmarkId]: [photoURL, ...] }. */
export async function getUserReviewPhotos(userId) {
  if (!db || !userId) return {};
  const snap = await getDocs(query(collection(db, 'reviews'), where('userId', '==', userId)));
  const map = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    const photos = x.photoURLs?.length ? x.photoURLs : x.photoURL ? [x.photoURL] : [];
    if (photos.length) map[x.landmarkId] = photos;
  });
  return map;
}

export async function getMyReview(userId, landmarkId) {
  if (!db || !userId) return null;
  const snap = await getDoc(doc(db, 'reviews', `${userId}_${landmarkId}`));
  return snap.exists() ? snap.data() : null;
}

/** Load every landmark's aggregate rating as { [landmarkId]: { avg, count } }. */
export async function getAllRatings() {
  if (!db) return {};
  const snap = await getDocs(collection(db, 'landmark_ratings'));
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    map[d.id] = { avg: data.avg || 0, count: data.count || 0 };
  });
  return map;
}

/** Recent reviews for a landmark. Single-field query (no composite index); sorted client-side. */
export async function getLandmarkReviews(landmarkId) {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, 'reviews'), where('landmarkId', '==', landmarkId), limit(100)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

/** Flag a review. One report per reporter per review. */
export async function reportReview({ reporterUid, review }) {
  await setDoc(doc(db, 'reports', `${reporterUid}_${review.id}`), {
    reviewId: review.id,
    reviewOwnerUid: review.userId,
    reporterUid,
    landmarkId: review.landmarkId,
    createdAt: serverTimestamp(),
  });
}

/** Report counts per review for a landmark, as { [reviewId]: count }. */
export async function getReportsForLandmark(landmarkId) {
  if (!db) return {};
  const snap = await getDocs(query(collection(db, 'reports'), where('landmarkId', '==', landmarkId)));
  const counts = {};
  snap.docs.forEach((d) => {
    const r = d.data();
    counts[r.reviewId] = (counts[r.reviewId] || 0) + 1;
  });
  return counts;
}

/** Delete your own review and roll its stars back out of the aggregate. */
export async function deleteMyReview(userId, landmarkId) {
  const reviewRef = doc(db, 'reviews', `${userId}_${landmarkId}`);
  const aggRef = doc(db, 'landmark_ratings', landmarkId);
  await runTransaction(db, async (tx) => {
    const prev = await tx.get(reviewRef);
    if (!prev.exists()) return;
    const s = prev.data().stars || 0;
    const agg = await tx.get(aggRef);
    const curSum = agg.exists() ? agg.data().sum || 0 : 0;
    const curCount = agg.exists() ? agg.data().count || 0 : 0;
    const newCount = Math.max(0, curCount - 1);
    const newSum = Math.max(0, curSum - s);
    tx.set(aggRef, { sum: newSum, count: newCount, avg: newCount ? newSum / newCount : 0, updatedAt: serverTimestamp() }, { merge: true });
    tx.delete(reviewRef);
  });
}

// Reviews hidden once they reach this many reports (community auto-moderation).
export const REPORT_HIDE_THRESHOLD = 2;
