import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firebase';

// How long researching ONE stop by hand -- cross-referencing reviews, maps,
// hours, whether it's actually worth the trip -- takes without Mapr. This is
// a stated assumption, not a real citation we can stand behind (we have no
// survey data of our own yet) -- replace it the moment real data exists
// (e.g. an onboarding question, or actual observed pre-Mapr planning time).
// What matters for now: it's ONE fixed number applied identically to every
// user and every reply, never invented per-session or tuned to look good.
export const MANUAL_MINUTES_PER_STOP = 12;

/**
 * Logs one real Mapr chat reply that produced stops -- the actual
 * generation time (`generationMs`, measured client-side around the fetch)
 * against MANUAL_MINUTES_PER_STOP for however many stops it handed back.
 * Time saved is never negative -- if the AI somehow took longer than the
 * manual baseline (it never realistically does), that reply just saved 0,
 * not a negative number.
 */
export async function logPlanningEvent(userId, { generationMs, stopsCount }) {
  if (!db || !userId || !stopsCount) return;
  const manualMinutes = stopsCount * MANUAL_MINUTES_PER_STOP;
  const minutesSaved = Math.max(0, manualMinutes - generationMs / 60000);
  await addDoc(collection(db, 'planning_events'), {
    userId,
    stopsCount,
    generationMs: Math.round(generationMs),
    minutesSaved,
    createdAt: serverTimestamp(),
  });
}

/** Sum of real logged minutesSaved from today (local midnight to now). */
export async function getTodaysTimeSavedMinutes(userId) {
  if (!db || !userId) return 0;
  const snap = await getDocs(query(collection(db, 'planning_events'), where('userId', '==', userId)));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartSec = todayStart.getTime() / 1000;
  let total = 0;
  snap.docs.forEach((d) => {
    const x = d.data();
    if ((x.createdAt?.seconds || 0) >= todayStartSec) total += x.minutesSaved || 0;
  });
  return Math.round(total);
}
