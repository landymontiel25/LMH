import { ALL_LANDMARKS } from '../data/regions';
import { isRateable } from './ratingFlow';
import { distanceMeters } from './geo';

// Local stand-in for /api/mapr-picks when the AI isn't reachable (no key,
// offline, rate-limited): a simple affinity score from the same inputs.
// Loved categories count for, skipped ones against, saved interests a
// little, plus a nudge from the crowd's rating and the editors' popularity.
const NEARBY_KM = 150;

// Category alone is too coarse to learn from fast: a zoo and a hiking trail
// both read as "parks-nature", a cemetery and a historic mansion both read
// as "history-culture". One bad experience with a specific TYPE of place
// (rated probably-skip, or repeatedly ✗'d) should suppress that type
// specifically and immediately, not just nudge the whole broad category
// down a little. This is a coarse keyword match on the place's own
// name/summary -- simple on purpose, since it only needs to catch the
// traveler's own words closely enough to recognize the same kind of place
// again.
const TYPE_KEYWORDS = [
  'zoo',
  'aquarium',
  'cemetery',
  'safari',
  'amusement park',
  'theme park',
  'water park',
  // Quiet, members-only or institutional sites -- a cricket club or a
  // meeting house shares a broad category (sports, history-culture) with
  // genuinely loved public places like a ballpark or a museum, but is a
  // completely different kind of visit. Specific complaints from this
  // project's own history, not a guess.
  'cricket club',
  'country club',
  'social club',
  'meeting house',
];

function typeKeywordOf(text) {
  const t = (text || '').toLowerCase();
  return TYPE_KEYWORDS.find((k) => t.includes(k)) || null;
}

export function localMaprPicks({
  reviews = [],
  interests = [],
  checkedInIds = [],
  regionIds = [],
  origin = null,
  ratings = {},
  feedback = [],
  passedIds = [],
  limit = 4,
}) {
  const affinity = {};
  // A single clear "probably skip" now counts for noticeably more than a
  // single loved rating pulls the other way -- taste should snap toward a
  // stated dislike fast, not need several repeats to overcome how many
  // things the traveler has loved overall.
  for (const r of reviews) {
    const w = r.tier === 'highly-recommend' ? 3 : r.tier === 'probably-skip' ? -3 : 1;
    for (const c of r.categories || []) affinity[c] = (affinity[c] || 0) + w;
  }
  for (const c of interests) affinity[c] = (affinity[c] || 0) + 1;
  // ✓ / ✗ on earlier picks: a lighter nudge than a rating (±1 per category).
  for (const f of feedback) {
    const w = f.verdict === 'yes' ? 1 : -1;
    for (const c of f.categories || []) affinity[c] = (affinity[c] || 0) + w;
  }

  // Specific-type suppression: one probably-skip rating on a place whose
  // name says what it specifically is, or two ✗ votes on the same type, is
  // enough to rule that type out entirely -- see TYPE_KEYWORDS above.
  const dislikedTypes = new Set();
  for (const r of reviews) {
    if (r.tier !== 'probably-skip') continue;
    const kw = typeKeywordOf(r.name);
    if (kw) dislikedTypes.add(kw);
  }
  const noVotesByType = {};
  for (const f of feedback) {
    if (f.verdict !== 'no') continue;
    const kw = typeKeywordOf(f.name);
    if (!kw) continue;
    noVotesByType[kw] = (noVotesByType[kw] || 0) + 1;
    if (noVotesByType[kw] >= 2) dislikedTypes.add(kw);
  }

  const visited = new Set([...checkedInIds, ...passedIds]);
  const cities = new Set(regionIds);
  let pool = ALL_LANDMARKS.filter(
    (l) =>
      !visited.has(l.id) &&
      isRateable(l) &&
      !dislikedTypes.has(typeKeywordOf(l.name) || typeKeywordOf(l.summary))
  );
  // Near you first: everything within NEARBY_KM of your fix (or, if that's
  // too few, the closest 40). Only without a fix do visited cities apply.
  if (origin) {
    pool = pool
      .map((l) => ({ ...l, km: distanceMeters(origin.lat, origin.lng, l.lat, l.lng) / 1000 }))
      .sort((a, b) => a.km - b.km);
    const near = pool.filter((l) => l.km <= NEARBY_KM);
    pool = near.length >= 4 ? near : pool.slice(0, 40);
  } else if (cities.size) {
    const inCities = pool.filter((l) => cities.has(l.regionId));
    if (inCities.length >= 8) pool = inCities;
  }

  const scored = pool.map((l) => {
    const cat = l.categories?.[0];
    const crowd = ratings[l.id]?.avg || 0;
    // Closer is better: full bonus at 0 km fading out by NEARBY_KM.
    const near = l.km != null ? Math.max(0, 1 - l.km / NEARBY_KM) * 3 : 0;
    // affinity[cat] drives which of these are worth showing at all --
    // ranked by the full score (distance/crowd/popularity as tie-breakers),
    // but see matchPercentage below for why it isn't what sets the %.
    const score = (affinity[cat] || 0) * 2 + crowd * 0.8 + (l.popularity || 0) * 0.15 + near;
    return { l, cat, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ l, cat }) => ({
      id: l.id,
      region: l.regionId,
      name: l.name,
      image: l.images?.[0] || null,
      categories: l.categories || [],
      // Reflects actual affinity for this category, not rank within
      // whatever happened to be nearby -- rescaling against the pool's own
      // min/max (as this used to) always gave the top of the pool ~98%
      // even when every nearby option was a category the traveler
      // disliked. No signal for the category at all lands at a neutral
      // 65%, not "should still be nearly perfect."
      matchPercentage: Math.round(Math.min(97, Math.max(45, 65 + (affinity[cat] || 0) * 6))),
      oneLineSummary: (l.summary || '').split(/[.!?]/)[0].slice(0, 90),
    }));
}

// Picks are cached per user, keyed on how many ratings they had at the
// time -- a new rating is one thing that should change them; the other is
// just time passing, since votes on the current set (which don't change
// ratingsCount) should still get a genuinely fresh batch from the AI
// before too long, not wait a full day. Shortened from 24h so a session's
// worth of ✓/✗ feedback actually gets re-reasoned about soon, not just
// patched over locally until the cache key itself changes.
const TTL_MS = 4 * 60 * 60 * 1000;
// Keyed on a coarse (~10 km) location too, so walking across town keeps
// the same picks but flying to another city gets fresh ones.
export const coarseLocation = (origin) => (origin ? `${origin.lat.toFixed(1)},${origin.lng.toFixed(1)}` : 'nowhere');
export const picksCacheKey = (uid, ratingsCount, origin) =>
  `lh-mapr-picks:${uid}:${ratingsCount}:${coarseLocation(origin)}`;

export function readPicksCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, picks } = JSON.parse(raw);
    if (!Array.isArray(picks) || Date.now() - at > TTL_MS) return null;
    return picks;
  } catch {
    return null;
  }
}

export function writePicksCache(key, picks) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), picks }));
  } catch {
    /* private mode */
  }
}
