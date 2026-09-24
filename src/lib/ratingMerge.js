import { doc, deleteDoc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { ALL_LANDMARKS, getLandmark } from '../data/regions';
import { getCustomLandmark, deleteCustomLandmark } from './customLandmarks';
import { getUserCheckins } from './leaderboard';
import { getMyReview, deleteMyReview } from './reviews';

// Admin Mode's "Fix Duplicate Ratings" (Settings). A real check-in/rating
// made before a place had a proper catalog entry gets saved against a
// user-submitted custom_landmarks doc -- e.g. rating "Le Duplex" back when
// there was no Paris region yet, or "Oeschinensee" before Switzerland's
// region existed. Once the real catalog entry ships, that old rating is
// orphaned: stuck on a duplicate pin instead of showing on the real
// landmark. This finds those and re-files the check-in/review under the
// real landmark's id, preserving the check-in's exact createdAt (including
// any Admin Mode date/time edit already made to it), then removes the
// now-redundant duplicate.

export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Only a real, points-earning check-in counts as "I actually went there" --
// a 0-point Mapr-only rating has nothing to physically merge.
export async function findOrphanedRatings(userId) {
  if (!db || !userId) return [];
  const rows = await getUserCheckins(userId);
  const candidates = [];
  for (const c of rows) {
    if (!c.points || !c.landmarkId || !c.region) continue;
    if (getLandmark(c.region, c.landmarkId)) continue; // already a real catalog landmark
    const custom = await getCustomLandmark(c.landmarkId);
    if (!custom) continue; // gone entirely, nothing to merge into
    const newLandmark = ALL_LANDMARKS.find((l) => namesMatch(l.name, custom.name || c.landmarkName));
    if (!newLandmark) continue;
    const oldReview = await getMyReview(userId, c.landmarkId);
    candidates.push({ oldCheckin: c, oldCustomLandmark: custom, oldReview, newLandmark });
  }
  return candidates;
}

// Same eventual-consistency retry submitReview uses -- the review create
// rule's exists(checkins/...) check can briefly see stale data right after
// the check-in it depends on was just written.
async function withPermissionRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e.code !== 'permission-denied' || attempt >= 3) throw e;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
}

async function migrateReview(oldReview, newLandmark) {
  const userId = oldReview.userId;
  const reviewRef = doc(db, 'reviews', `${userId}_${newLandmark.id}`);
  const aggRef = doc(db, 'landmark_ratings', newLandmark.id);
  const stars = oldReview.stars || 0;
  const { landmarkId: _landmarkId, landmarkName: _landmarkName, region: _region, updatedAt: _updatedAt, ...rest } = oldReview;
  await withPermissionRetry(() =>
    runTransaction(db, async (tx) => {
      const agg = await tx.get(aggRef);
      const curSum = agg.exists() ? agg.data().sum || 0 : 0;
      const curCount = agg.exists() ? agg.data().count || 0 : 0;
      const newSum = curSum + stars;
      const newCount = curCount + 1;
      tx.set(
        aggRef,
        { landmarkId: newLandmark.id, sum: newSum, count: newCount, avg: newCount ? newSum / newCount : 0, updatedAt: serverTimestamp() },
        { merge: true }
      );
      tx.set(reviewRef, {
        ...rest,
        landmarkId: newLandmark.id,
        landmarkName: newLandmark.name,
        region: newLandmark.regionId,
        updatedAt: serverTimestamp(),
      });
    })
  );
}

export async function mergeOrphanedRating({ oldCheckin, oldCustomLandmark, oldReview, newLandmark }) {
  const userId = oldCheckin.userId;
  const newCheckinRef = doc(db, 'checkins', `${userId}_${newLandmark.id}`);
  const existingNewCheckin = await getDoc(newCheckinRef);
  if (!existingNewCheckin.exists()) {
    // eslint-disable-next-line no-unused-vars
    const { id, landmarkId, landmarkName, region, ...rest } = oldCheckin;
    await setDoc(newCheckinRef, {
      ...rest,
      landmarkId: newLandmark.id,
      landmarkName: newLandmark.name,
      region: newLandmark.regionId,
    });
  }

  if (oldReview) {
    const existingNewReview = await getMyReview(userId, newLandmark.id);
    if (!existingNewReview) await migrateReview(oldReview, newLandmark);
    await deleteMyReview(userId, oldCheckin.landmarkId);
  }

  // Admin-only delete (firestore.rules) -- the old check-in and duplicate
  // pin are gone for good the moment this resolves, same as any other
  // Admin Mode action.
  await deleteDoc(doc(db, 'checkins', oldCheckin.id));
  await deleteCustomLandmark(oldCustomLandmark.docId);
}
