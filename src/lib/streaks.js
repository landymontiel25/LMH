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

// Threshold for "Regional Master" -- deliberately steep ("make it a ton" per
// request): most of the smaller regions (Frankfurt, Coral Gables, Key
// Biscayne) don't even have this many landmarks total, so it's only
// reachable in the larger cities. That's intentional, not an oversight.
export const REGIONAL_MASTER_THRESHOLD = 20;

// The full catalog of every badge that can ever be earned -- Full Stats
// renders all of these (earned ones in color, the rest grayed out),
// while computeBadges below just filters it down to what you've earned.
// `kind` keys into the `counts` map computeBadges/closestUnearnedBadge
// build -- checkins/cities/streak/milestone come from this file's own
// stats; everything past `welcome` is fed in via the `extra` param, computed
// in BadgesContext (src/lib/badgeStats.js + leaderboard.js have the actual
// derivations -- this file only holds the catalog + the threshold check).
export const ALL_BADGES = [
  { id: 'checkins-1', kind: 'checkins', n: 1, label: 'First Steps', icon: '\u{1F463}', description: 'Your first check-in', rarity: 'common' },
  { id: 'checkins-5', kind: 'checkins', n: 5, label: 'Explorer', icon: '\u{1F9ED}', description: '5 check-ins', rarity: 'common' },
  { id: 'checkins-10', kind: 'checkins', n: 10, label: 'Adventurer', icon: '\u{26F0}\u{FE0F}', description: '10 check-ins', rarity: 'uncommon' },
  { id: 'checkins-25', kind: 'checkins', n: 25, label: 'Legend', icon: '\u{1F3C6}', description: '25 check-ins', rarity: 'rare' },
  { id: 'expedition', kind: 'checkins', n: 50, label: 'Expedition', icon: '\u{1F392}', description: '50 check-ins', rarity: 'rare' },
  { id: 'cartographer', kind: 'checkins', n: 100, label: 'Cartographer', icon: '\u{1F5FA}\u{FE0F}', description: '100 check-ins', rarity: 'legendary' },
  { id: 'cities-2', kind: 'cities', n: 2, label: 'City Hopper', icon: '\u{1F306}', description: 'Checked in across 2 cities', rarity: 'common' },
  { id: 'cities-3', kind: 'cities', n: 3, label: 'Globetrotter', icon: '\u{1F30D}', description: 'Checked in across 3 cities', rarity: 'uncommon' },
  { id: 'streak-3', kind: 'streak', n: 3, label: '3-Day Streak', icon: '\u{1F525}', description: 'Checked in 3 days in a row', rarity: 'common' },
  { id: 'streak-7', kind: 'streak', n: 7, label: '7-Day Streak', icon: '\u{1F525}', description: 'Checked in 7 days in a row', rarity: 'uncommon' },
  { id: 'streak-30', kind: 'streak', n: 30, label: '30-Day Streak', icon: '\u{1F525}', description: 'Checked in 30 days in a row', rarity: 'legendary' },
  { id: 'welcome', kind: 'milestone', n: 1, label: 'Welcome', icon: '\u{1F389}', description: 'Completed onboarding', rarity: 'common' },

  // Check-In Depth
  { id: 'photo-contributor', kind: 'photoCheckins', n: 10, label: 'Photo Contributor', icon: '\u{1F4F8}', description: '10 check-ins with a photo', rarity: 'uncommon' },
  { id: 'reviewer', kind: 'fiveStarReview', n: 1, label: 'Reviewer', icon: '\u{2B50}', description: 'Gave a Highly Recommend review', rarity: 'common' },
  { id: 'describer', kind: 'factLandmarks', n: 3, label: 'Describer', icon: '\u{1F4DD}', description: 'Added facts to 3 landmarks', rarity: 'uncommon' },

  // Social
  { id: 'friend-finder', kind: 'friends', n: 5, label: 'Friend Finder', icon: '\u{1F465}', description: 'Added 5 friends', rarity: 'common' },
  { id: 'competitor', kind: 'top10', n: 1, label: 'Competitor', icon: '\u{1F3C5}', description: 'Reached the top 10 leaderboard', rarity: 'rare' },
  { id: 'tag-team', kind: 'tagTeam', n: 1, label: 'Tag Team', icon: '\u{1F91D}', description: 'Checked in with a friend within 24 hours', rarity: 'uncommon' },

  // Geographic Coverage
  { id: 'regional-master', kind: 'regionMax', n: REGIONAL_MASTER_THRESHOLD, label: 'Regional Master', icon: '\u{1F4CD}', description: `Checked into ${REGIONAL_MASTER_THRESHOLD} landmarks in one region`, rarity: 'rare' },
  { id: 'cross-country', kind: 'states', n: 5, label: 'Cross-Country', icon: '\u{1F6E3}\u{FE0F}', description: 'Checked in across 5 states', rarity: 'rare' },
  { id: 'continent-hopper', kind: 'countries', n: 3, label: 'Continent Hopper', icon: '\u{2708}\u{FE0F}', description: 'Checked in across 3 countries', rarity: 'legendary' },

  // Trip Planning
  { id: 'planner', kind: 'tripLandmarks', n: 1, label: 'Planner', icon: '\u{1F5D2}\u{FE0F}', description: 'Created an itinerary', rarity: 'common' },
  { id: 'route-optimizer', kind: 'tripLandmarks', n: 5, label: 'Route Optimizer', icon: '\u{1F9ED}', description: 'Planned a 5+ landmark trip', rarity: 'uncommon' },

  // Variety Challenges
  { id: 'all-star', kind: 'allStarWeek', n: 1, label: 'All-Star', icon: '\u{1F31F}', description: 'Checked into a museum, restaurant, historic site, and nature spot in one week', rarity: 'rare' },
  { id: 'cuisine-explorer', kind: 'cuisineTypes', n: 5, label: 'Cuisine Explorer', icon: '\u{1F37D}\u{FE0F}', description: '5 different food spots', rarity: 'uncommon' },

  // Rare/Timed
  { id: 'night-owl', kind: 'nightOwl', n: 1, label: 'Night Owl', icon: '\u{1F989}', description: 'Checked in between midnight and 6am', rarity: 'rare' },
  { id: 'golden-hour', kind: 'goldenHour', n: 1, label: 'Golden Hour', icon: '\u{1F307}', description: 'Checked in during sunset (6-7pm)', rarity: 'uncommon' },
];

export function computeBadges({ checkinsCount, citiesCount, streakDays, onboardingCompleted = false, extra = {} }) {
  const counts = {
    checkins: checkinsCount,
    cities: citiesCount,
    streak: streakDays,
    milestone: onboardingCompleted ? 1 : 0,
    ...extra,
  };
  return ALL_BADGES.filter((b) => counts[b.kind] >= b.n);
}

/** The unearned badge you're numerically closest to completing (smallest remaining gap), or null once every badge is earned. */
export function closestUnearnedBadge({ checkinsCount, citiesCount, streakDays, onboardingCompleted = false, extra = {} }) {
  const counts = {
    checkins: checkinsCount,
    cities: citiesCount,
    streak: streakDays,
    milestone: onboardingCompleted ? 1 : 0,
    ...extra,
  };
  const unearned = ALL_BADGES.filter((b) => counts[b.kind] < b.n);
  if (unearned.length === 0) return null;
  return unearned.reduce((closest, b) => (b.n - counts[b.kind] < closest.n - counts[closest.kind] ? b : closest));
}
