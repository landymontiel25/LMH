import {
  doc,
  getDoc,
  getDocs,
  runTransaction,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { distanceMeters } from './geo';

export { distanceMeters };

export const POINTS_PER_CHECKIN = 100;
// Default "you're here" radius. Individual landmarks can widen this via
// `checkInRadiusMeters` (malls, parks, beaches, national parks, etc.).
export const CHECKIN_RADIUS_METERS = 100;

function pad(n) {
  return String(n).padStart(2, '0');
}

// ISO-8601 week number
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`;
}

export function periodKeys(date = new Date()) {
  return {
    weekly: isoWeekKey(date),
    monthly: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
    yearly: `${date.getFullYear()}`,
  };
}

export const PERIODS = ['weekly', 'monthly', 'yearly'];

/**
 * Claims points for a landmark check-in. Idempotent per user+landmark: a landmark
 * can only ever award points once for a given user, tracked via the `checkins` doc id.
 * Returns { claimed: boolean, alreadyClaimed: boolean }.
 */
export async function claimCheckIn({ userId, userName, landmarkId, landmarkName, region, points = POINTS_PER_CHECKIN }) {
  const checkinRef = doc(db, 'checkins', `${userId}_${landmarkId}`);
  const keys = periodKeys();

  const result = await runTransaction(db, async (tx) => {
    const existing = await tx.get(checkinRef);
    if (existing.exists()) {
      return { claimed: false, alreadyClaimed: true };
    }

    tx.set(checkinRef, {
      userId,
      userName,
      landmarkId,
      landmarkName,
      region,
      points,
      createdAt: serverTimestamp(),
    });

    for (const period of PERIODS) {
      const entryRef = doc(db, 'leaderboard_entries', `${period}_${keys[period]}_${userId}`);
      tx.set(
        entryRef,
        {
          userId,
          userName,
          period,
          periodKey: keys[period],
          points: increment(points),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    return { claimed: true, alreadyClaimed: false };
  });

  return result;
}

/**
 * Rewrites the display name on every existing check-in and leaderboard entry for
 * a user — used when they set/change their username so past scores stop showing
 * an email (or an old handle) on the public board.
 */
export async function backfillUserName(userId, userName) {
  if (!db || !userId || !userName) return;
  const batch = writeBatch(db);
  const [checkins, entries] = await Promise.all([
    getDocs(query(collection(db, 'checkins'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'leaderboard_entries'), where('userId', '==', userId))),
  ]);
  checkins.docs.forEach((d) => batch.update(d.ref, { userName }));
  entries.docs.forEach((d) => batch.update(d.ref, { userName }));
  await batch.commit();
}

/**
 * Uploads the photo taken at check-in and stores its URL right on the check-in
 * doc — so every check-in keeps the user's own picture even if they skip the
 * star rating afterwards. Best-effort; never throws.
 */
export async function attachCheckinPhoto(userId, landmarkId, file) {
  if (!storage || !db || !file) return null;
  try {
    const sref = ref(storage, `checkin_photos/${landmarkId}/${userId}.jpg`);
    await uploadBytes(sref, file, { contentType: file.type || 'image/jpeg' });
    const url = await getDownloadURL(sref);
    await updateDoc(doc(db, 'checkins', `${userId}_${landmarkId}`), { photoURL: url });
    return url;
  } catch {
    return null;
  }
}

export async function hasClaimedLandmark(userId, landmarkId) {
  const snap = await getDoc(doc(db, 'checkins', `${userId}_${landmarkId}`));
  return snap.exists();
}

/**
 * Sums a user's all-time points across every landmark they've checked into.
 * A single-field equality query, so no composite index is needed.
 */
export async function getUserTotalPoints(userId) {
  const snap = await getDocs(query(collection(db, 'checkins'), where('userId', '==', userId)));
  return snap.docs.reduce((sum, d) => sum + (d.data().points || 0), 0);
}

/**
 * One-query rollup of a user's all-time stats: total points, number of
 * check-ins, and how many distinct cities/regions they've visited.
 */
export async function getUserStats(userId) {
  const snap = await getDocs(query(collection(db, 'checkins'), where('userId', '==', userId)));
  let totalPoints = 0;
  const regions = new Set();
  const cityLastVisit = {}; // regionId -> most recent check-in, in epoch seconds
  snap.docs.forEach((d) => {
    const x = d.data();
    totalPoints += x.points || 0;
    if (x.region) {
      regions.add(x.region);
      const sec = x.createdAt?.seconds || 0;
      if (sec > (cityLastVisit[x.region] || 0)) cityLastVisit[x.region] = sec;
    }
  });
  // Most-recently-visited city first, same ordering as the check-ins list.
  const cityIds = [...regions].sort((a, b) => (cityLastVisit[b] || 0) - (cityLastVisit[a] || 0));
  return { totalPoints, checkins: snap.size, cities: regions.size, cityIds, cityLastVisit };
}

/**
 * Full check-in history for a user (newest first) — id, landmark, region,
 * points, timestamp. Single-field query; sorted client-side.
 */
export async function getUserCheckins(userId) {
  if (!db || !userId) return [];
  const snap = await getDocs(query(collection(db, 'checkins'), where('userId', '==', userId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

/**
 * Returns the set of landmark IDs a user has already checked into.
 * A single-field equality query, so no composite index is needed.
 */
export async function getUserCheckedInLandmarkIds(userId) {
  const snap = await getDocs(query(collection(db, 'checkins'), where('userId', '==', userId)));
  return snap.docs.map((d) => d.data().landmarkId);
}

/**
 * Subscribes to the top entries for a leaderboard period. Calls onData with a sorted array.
 * Returns an unsubscribe function.
 */
export function subscribeLeaderboard(period, onData, topN = 50) {
  const keys = periodKeys();
  const q = query(
    collection(db, 'leaderboard_entries'),
    where('period', '==', period),
    where('periodKey', '==', keys[period]),
    orderBy('points', 'desc'),
    limit(topN)
  );
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
