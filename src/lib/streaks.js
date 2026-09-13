// Daily check-in streak + milestone badges (item i1) -- both derived
// entirely from the same check-in history Profile already fetches, so
// there's nothing new to store or keep in sync.

const dayKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

/**
 * Consecutive days (UTC) with at least one check-in, counting back from
 * today. A day with no check-in yet doesn't break the streak until
 * tomorrow -- so "yesterday, but not yet today" still counts.
 */
export function computeStreakDays(checkins, now = new Date()) {
  const days = new Set();
  for (const c of checkins) {
    const sec = c.createdAt?.seconds;
    if (!sec) continue;
    days.add(dayKey(new Date(sec * 1000)));
  }
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

const CHECKIN_MILESTONES = [
  { n: 1, label: 'First Steps', icon: '\u{1F463}', description: 'Your first check-in' },
  { n: 5, label: 'Explorer', icon: '\u{1F9ED}', description: '5 check-ins' },
  { n: 10, label: 'Adventurer', icon: '\u{26F0}\u{FE0F}', description: '10 check-ins' },
  { n: 25, label: 'Legend', icon: '\u{1F3C6}', description: '25 check-ins' },
];
const CITY_MILESTONES = [
  { n: 2, label: 'City Hopper', icon: '\u{1F306}', description: 'Checked in across 2 cities' },
  { n: 3, label: 'Globetrotter', icon: '\u{1F30D}', description: 'Checked in across 3 cities' },
];
const STREAK_MILESTONES = [
  { n: 3, label: '3-Day Streak', icon: '\u{1F525}', description: 'Checked in 3 days in a row' },
  { n: 7, label: '7-Day Streak', icon: '\u{1F525}', description: 'Checked in 7 days in a row' },
  { n: 30, label: '30-Day Streak', icon: '\u{1F525}', description: 'Checked in 30 days in a row' },
];

export function computeBadges({ checkinsCount, citiesCount, streakDays }) {
  const badges = [];
  for (const m of CHECKIN_MILESTONES)
    if (checkinsCount >= m.n) badges.push({ id: `checkins-${m.n}`, label: m.label, icon: m.icon, description: m.description });
  for (const m of CITY_MILESTONES)
    if (citiesCount >= m.n) badges.push({ id: `cities-${m.n}`, label: m.label, icon: m.icon, description: m.description });
  for (const m of STREAK_MILESTONES)
    if (streakDays >= m.n) badges.push({ id: `streak-${m.n}`, label: m.label, icon: m.icon, description: m.description });
  return badges;
}
