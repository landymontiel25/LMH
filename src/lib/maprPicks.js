import { ALL_LANDMARKS } from '../data/regions';
import { isRateable } from './ratingFlow';
import { distanceMeters } from './geo';

// Local stand-in for /api/mapr-picks when the AI isn't reachable (no key,
// offline, rate-limited): a simple affinity score from the same inputs.
// Loved categories count for, skipped ones against, saved interests a
// little, plus a nudge from the crowd's rating and the editors' popularity.
const NEARBY_KM = 150;

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
  for (const r of reviews) {
    const w = r.tier === 'highly-recommend' ? 3 : r.tier === 'probably-skip' ? -2 : 1;
    for (const c of r.categories || []) affinity[c] = (affinity[c] || 0) + w;
  }
  for (const c of interests) affinity[c] = (affinity[c] || 0) + 1;
  // ✓ / ✗ on earlier picks: a lighter nudge than a rating (±1 per category).
  for (const f of feedback) {
    const w = f.verdict === 'yes' ? 1 : -1;
    for (const c of f.categories || []) affinity[c] = (affinity[c] || 0) + w;
  }

  const visited = new Set([...checkedInIds, ...passedIds]);
  const cities = new Set(regionIds);
  let pool = ALL_LANDMARKS.filter((l) => !visited.has(l.id) && isRateable(l));
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
    const score = (affinity[cat] || 0) * 2 + crowd * 0.8 + (l.popularity || 0) * 0.15 + near;
    return { l, score };
  });
  const max = Math.max(1, ...scored.map((s) => s.score));
  const min = Math.min(0, ...scored.map((s) => s.score));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ l, score }) => ({
      id: l.id,
      region: l.regionId,
      name: l.name,
      image: l.images?.[0] || null,
      categories: l.categories || [],
      matchPercentage: Math.round(70 + (28 * (score - min)) / (max - min || 1)),
      oneLineSummary: (l.summary || '').split(/[.!?]/)[0].slice(0, 90),
    }));
}

// Picks are cached per user for a day, keyed on how many ratings they had
// at the time -- a new rating is the one thing that should change them.
const TTL_MS = 24 * 60 * 60 * 1000;
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
