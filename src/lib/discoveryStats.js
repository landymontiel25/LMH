import { isRealCheckin } from './leaderboard';

const DAY_MS = 86400000;

/**
 * "New places this week": a straight count, not an estimate -- unique
 * landmarks visited for the FIRST time (visit 1, or an undefined
 * visitNumber for check-ins written before visit numbering existed --
 * those are always a first visit too) in the trailing 7 days. Time-saved
 * is tracked separately (src/lib/timeSaved.js), from real generation time,
 * not derived from check-in counts.
 */
export function computeNewPlacesThisWeek(checkins, now = Date.now()) {
  const weekAgo = now - 7 * DAY_MS;
  let count = 0;
  for (const c of checkins || []) {
    if (!isRealCheckin(c) || !c.createdAt?.seconds) continue;
    const isFirstVisit = c.visitNumber == null || c.visitNumber === 1;
    if (isFirstVisit && c.createdAt.seconds * 1000 >= weekAgo) count += 1;
  }
  return count;
}
