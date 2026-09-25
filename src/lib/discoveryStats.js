import { isRealCheckin } from './leaderboard';

const DAY_MS = 86400000;
// A rough, honest estimate -- Mapr replacing "search reviews, cross-check a
// map, read summaries" with a single tap/reply is worth a few minutes, not
// an exact figure. Kept modest on purpose so the number stays believable.
const MINUTES_SAVED_PER_ACTION = 4;

/**
 * The "time saved and discovery" stats that replace points/leaderboard as
 * the headline on Profile and Mapr (item 7 of the changelist) -- pure
 * function over a user's check-ins so it's cheap to test and cheap to
 * recompute anywhere those check-ins are already loaded.
 *
 * newPlacesThisWeek: distinct landmarks visited for the FIRST time (visit 1,
 * or undefined visitNumber for check-ins written before visit numbering
 * existed -- those are always a first visit too) in the last 7 days.
 * minutesSavedToday: every real check-in logged today stands in for research
 * Mapr already did -- finding the place, sanity-checking it's worth going.
 */
export function computeDiscoveryStats(checkins, now = Date.now()) {
  const real = (checkins || []).filter(isRealCheckin).filter((c) => c.createdAt?.seconds);
  const weekAgo = now - 7 * DAY_MS;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  let newPlacesThisWeek = 0;
  let actionsToday = 0;
  for (const c of real) {
    const ms = c.createdAt.seconds * 1000;
    const isFirstVisit = c.visitNumber == null || c.visitNumber === 1;
    if (isFirstVisit && ms >= weekAgo) newPlacesThisWeek += 1;
    if (ms >= todayStart.getTime()) actionsToday += 1;
  }

  return { newPlacesThisWeek, minutesSavedToday: actionsToday * MINUTES_SAVED_PER_ACTION };
}
