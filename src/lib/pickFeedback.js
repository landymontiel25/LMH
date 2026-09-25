import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';

// ✓ / ✗ / 🤷 on a Mapr pick: "I'd go" / "not for me" / "not sure". ✓ and ✗
// are a light, general-taste signal -- lighter than a rating, and
// context-dependent (you might skip a cathedral at night in Miami and still
// love cathedrals in Italy), so they nudge category preferences rather than
// ruling anything out; either way, that exact place is kept out of your
// picks for good, since it's a real, conclusive verdict. "Not sure" is
// different on purpose: it carries no taste signal at all and never
// blacklists the place -- Mapr Picks is meant to hold only things you'd
// clearly go to or clearly skip, so "not sure" just means "ask me again
// later" (see votedIds below).
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
    verdict, // 'yes' | 'no' | 'unsure'
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

// Every landmark you've given a REAL verdict on (✓ or ✗) -- once you vote
// either way, Mapr never shows it again, that verdict is conclusive. "Not
// sure" is deliberately excluded here: it means "I don't know yet", not "I
// like/dislike this", and Mapr Picks is only meant to hold things you'd
// clearly go to or clearly skip -- so an "unsure" place drops out of the
// CURRENT deck (MaprPicksCarousel keeps it out of the immediate refill via
// its own feedback state) but stays eligible to be offered again later,
// once the current queue/cache moves on, instead of being blacklisted for
// good like a real ✓/✗.
export function votedIds(feedback) {
  return Object.values(feedback || {})
    .filter((f) => f.verdict === 'yes' || f.verdict === 'no')
    .map((f) => f.landmarkId);
}
