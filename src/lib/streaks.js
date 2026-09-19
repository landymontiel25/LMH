// Daily check-in streak + milestone badges (item i1) -- both derived
// entirely from the same check-in history Profile already fetches, so
// there's nothing new to store or keep in sync.

const dayKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

/** Whether any of these check-ins happened today (UTC) -- used to warn when an active streak is about to lapse. */
export function hasCheckedInToday(checkins, now = new Date()) {
  const today = dayKey(now);
  return checkins.some((c) => c.createdAt?.seconds && dayKey(new Date(c.createdAt.seconds * 1000)) === today);
}

// Minimum distinct landmarks you must vote ✓/✗ on in a day (Mapr Picks) for
// that day to count toward your streak, same as an actual check-in would --
// lets a day with no real visit still keep the streak alive. Never earns
// check-in points, a check-in count, or a city credit; it only feeds this
// streak math, from pick_feedback entries (voted landmarkId + `at` epoch ms).
export const PICKS_STREAK_THRESHOLD = 5;

// Day-keys (UTC) with at least `minVotes` distinct landmarks voted on.
function pickVoteDayKeys(pickFeedback, minVotes = PICKS_STREAK_THRESHOLD) {
  const idsByDay = new Map();
  for (const f of pickFeedback || []) {
    if (!f.at || !f.landmarkId) continue;
    const key = dayKey(new Date(f.at));
    if (!idsByDay.has(key)) idsByDay.set(key, new Set());
    idsByDay.get(key).add(f.landmarkId);
  }
  const days = new Set();
  for (const [key, ids] of idsByDay) {
    if (ids.size >= minVotes) days.add(key);
  }
  return days;
}

/**
 * Whether today's streak is already secured -- a real check-in, or voting
 * ✓/✗ on PICKS_STREAK_THRESHOLD distinct Mapr Picks. Supersedes
 * hasCheckedInToday wherever "is the streak safe today" (not "did you
 * literally check in") is the actual question -- the streak-risk banner
 * and Profile's streak messaging both want this one.
 */
export function hasSecuredStreakToday(checkins, pickFeedback = [], now = new Date()) {
  return hasCheckedInToday(checkins, now) || pickVoteDayKeys(pickFeedback).has(dayKey(now));
}

/**
 * Milliseconds until the current UTC day ends -- the moment an active
 * streak with no check-in yet today actually lapses (computeStreakDays
 * counts by UTC calendar day, so this is the same boundary). Feeds the
 * "your streak expires in ..." countdown banner.
 */
export function msUntilStreakLapse(now = new Date()) {
  const nextMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return nextMidnightUTC - now.getTime();
}

/**
 * Consecutive days (UTC) with at least one check-in -- or a qualifying
 * Mapr Picks voting day, see hasSecuredStreakToday -- counting back from
 * today. A day with neither yet doesn't break the streak until tomorrow --
 * so "yesterday, but not yet today" still counts.
 */
export function computeStreakDays(checkins, now = new Date(), pickFeedback = []) {
  const days = new Set();
  for (const c of checkins) {
    const sec = c.createdAt?.seconds;
    if (!sec) continue;
    days.add(dayKey(new Date(sec * 1000)));
  }
  for (const key of pickVoteDayKeys(pickFeedback)) days.add(key);
  if (days.size === 0) return 0;

  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// Rarity is a fixed design-time tier, not something measured across real
// users -- the app has no population-level stats on who holds which badge.
// It only exists to give the Full Stats page a "show the impressive ones
// first" sort; common < uncommon < rare < legendary.
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// The full catalog of every badge that can ever be earned -- Full Stats
// renders all of these (earned ones in color, the rest grayed out),
// while computeBadges below just filters it down to what you've earned.
export const ALL_BADGES = [
  { id: 'checkins-1', kind: 'checkins', n: 1, label: 'First Steps', icon: '\u{1F463}', description: 'Your first check-in', rarity: 'common' },
  { id: 'checkins-5', kind: 'checkins', n: 5, label: 'Explorer', icon: '\u{1F9ED}', description: '5 check-ins', rarity: 'common' },
  { id: 'checkins-10', kind: 'checkins', n: 10, label: 'Adventurer', icon: '\u{26F0}\u{FE0F}', description: '10 check-ins', rarity: 'uncommon' },
  { id: 'checkins-25', kind: 'checkins', n: 25, label: 'Legend', icon: '\u{1F3C6}', description: '25 check-ins', rarity: 'rare' },
  { id: 'cities-2', kind: 'cities', n: 2, label: 'City Hopper', icon: '\u{1F306}', description: 'Checked in across 2 cities', rarity: 'common' },
  { id: 'cities-3', kind: 'cities', n: 3, label: 'Globetrotter', icon: '\u{1F30D}', description: 'Checked in across 3 cities', rarity: 'uncommon' },
  { id: 'streak-3', kind: 'streak', n: 3, label: '3-Day Streak', icon: '\u{1F525}', description: 'Checked in 3 days in a row', rarity: 'common' },
  { id: 'streak-7', kind: 'streak', n: 7, label: '7-Day Streak', icon: '\u{1F525}', description: 'Checked in 7 days in a row', rarity: 'uncommon' },
  { id: 'streak-30', kind: 'streak', n: 30, label: '30-Day Streak', icon: '\u{1F525}', description: 'Checked in 30 days in a row', rarity: 'legendary' },
  { id: 'welcome', kind: 'milestone', n: 1, label: 'Welcome', icon: '\u{1F389}', description: 'Completed onboarding', rarity: 'common' },
];

export function computeBadges({ checkinsCount, citiesCount, streakDays, onboardingCompleted = false }) {
  const counts = { checkins: checkinsCount, cities: citiesCount, streak: streakDays, milestone: onboardingCompleted ? 1 : 0 };
  return ALL_BADGES.filter((b) => counts[b.kind] >= b.n);
}

/** The unearned badge you're numerically closest to completing (smallest remaining gap), or null once every badge is earned. */
export function closestUnearnedBadge({ checkinsCount, citiesCount, streakDays, onboardingCompleted = false }) {
  const counts = { checkins: checkinsCount, cities: citiesCount, streak: streakDays, milestone: onboardingCompleted ? 1 : 0 };
  const unearned = ALL_BADGES.filter((b) => counts[b.kind] < b.n);
  if (unearned.length === 0) return null;
  return unearned.reduce((closest, b) => (b.n - counts[b.kind] < closest.n - counts[closest.kind] ? b : closest));
}
