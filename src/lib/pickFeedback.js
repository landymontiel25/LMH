import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';

// ✓ / ✗ on a Mapr pick: "I'd go" / "not for me". A light, general-taste
// signal -- lighter than a rating, and context-dependent (you might skip
// a cathedral at night in Miami and still love cathedrals in Italy), so
// it nudges category preferences rather than ruling anything out. Whichever
// way you vote, that exact place is kept out of your picks for good --
// once you've weighed in on it, Mapr doesn't need to ask again.
//
// Stored two ways: localStorage (instant, always works) and Firestore
// pick_feedback/{uid}_{landmarkId} (best-effort; survives a new phone).

const KEY = (uid) => `lh-pick-feedback:${uid}`;

function readLocal(uid) {
  try {
    return JSON.parse(localStorage.getItem(KEY(uid)) || '{}') || {};
  } catch {
    return {};
  }
}

function writeLocal(uid, map) {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

export async function setPickFeedback({ uid, landmark, verdict, origin }) {
  const entry = {
    landmarkId: landmark.id,
    region: landmark.region,
    name: landmark.name,
    categories: landmark.categories || [],
    verdict, // 'yes' | 'no'
    at: Date.now(),
    near: origin ? { lat: Number(origin.lat.toFixed(2)), lng: Number(origin.lng.toFixed(2)) } : null,
  };
  const map = readLocal(uid);
  map[landmark.id] = entry;
  writeLocal(uid, map);
  if (!db) return entry;
  try {
    await setDoc(doc(db, 'pick_feedback', `${uid}_${landmark.id}`), { userId: uid, ...entry, updatedAt: serverTimestamp() });
  } catch {
    /* rules not deployed yet, or offline -- the local copy still counts */
  }
  return entry;
}

// Synchronous (localStorage only, no Firestore round trip) -- for painting
// something instantly on mount instead of waiting on getPickFeedback's
// network read. getPickFeedback below still runs right after and reconciles
// with Firestore for the authoritative copy.
export function readLocalFeedback(uid) {
  return readLocal(uid);
}

export async function getPickFeedback(uid) {
  const map = readLocal(uid);
  if (db) {
    try {
      const snap = await getDocs(query(collection(db, 'pick_feedback'), where('userId', '==', uid)));
      for (const d of snap.docs) {
        const r = d.data();
        if (!map[r.landmarkId] || (r.at || 0) > (map[r.landmarkId].at || 0)) {
          map[r.landmarkId] = { landmarkId: r.landmarkId, region: r.region, name: r.name, categories: r.categories || [], verdict: r.verdict, at: r.at || 0, near: r.near || null };
        }
      }
      writeLocal(uid, map);
    } catch {
      /* fall back to the local copy */
    }
  }
  return map;
}

// Every landmark you've ever voted ✓ or ✗ on -- once you vote on one, Mapr
// never shows it again, whichever way you voted.
export function votedIds(feedback) {
  return Object.values(feedback || {}).map((f) => f.landmarkId);
}
