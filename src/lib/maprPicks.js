import { ALL_LANDMARKS } from '../data/regions';
import { isRateable, chipLabel } from './ratingFlow';
import { distanceMeters } from './geo';

// Local stand-in for /api/mapr-picks when the AI isn't reachable (no key,
// offline, rate-limited): a simple affinity score from the same inputs.
// Loved categories count for, skipped ones against, saved interests a
// little, plus a nudge from the crowd's rating and the editors' popularity.
const NEARBY_KM = 150;

// Category alone is too coarse to learn from fast: a zoo and a hiking trail
// both read as "parks-nature", a cemetery and a historic mansion both read
// as "history-culture". What actually explains a rating is the SPECIFIC
// reason behind it -- the traveler's own words, in their comment and the
// chip they tapped -- not the broad bucket the landmark happens to sit in.
// This list is the vocabulary that reasoning runs on: matched against a
// review's comment + chip labels on one side, and a candidate's own
// name/summary on the other. Two kinds of entries: concrete place TYPES
// (a zoo is never a hiking trail, whatever the category says) and
// experiential TRAITS pulled straight from how people actually describe
// why they loved or skipped somewhere.
const TRAIT_KEYWORDS = [
  // Specific place types.
  'zoo',
  'aquarium',
  'cemetery',
  'safari',
  'amusement park',
  'theme park',
  'water park',
  'cricket club',
  'country club',
  'social club',
  'meeting house',
  // Experiential traits -- "loved it for the rooftop view" should boost
  // other places whose own description mentions a view, not just
  // "restaurants" or "parks" in general.
  'rooftop',
  'view',
  'waterfront',
  'scenic',
  'crowded',
  'long lines',
  'busy',
  'quiet',
  'peaceful',
  'relaxing',
  'live music',
  'nightlife',
  'family-friendly',
  'kid-friendly',
  'romantic',
  'historic',
];

// Every TRAIT_KEYWORDS entry found in `text` (lowercased, substring match --
// simple on purpose, since it only needs to catch the traveler's own words
// closely enough to recognize the same kind of place or the same reason
// again).
function keywordsIn(text) {
  const t = (text || '').toLowerCase();
  return TRAIT_KEYWORDS.filter((k) => t.includes(k));
}

// Recent signal matters more than old signal (preferences shift -- someone
// who loved clubs at 21 might not at 25), but old signal should FADE, not
// vanish outright. Halves every ~4 months. A review/vote with no known
// timestamp (older data, or a caller that doesn't have one) is treated as
// full-weight rather than guessed at as stale.
const RECENCY_HALF_LIFE_DAYS = 120;
function recencyWeight(seconds, nowSec) {
  if (!seconds) return 1;
  const ageDays = Math.max(0, nowSec - seconds) / 86400;
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

// Builds the same category-affinity + trait-keyword model localMaprPicks
// scores candidates against, but as its own reusable step -- so
// tasteProfile.js's prediction-confidence check (predict a rating from
// every OTHER rating, see how close it lands) runs the identical reasoning
// Mapr Picks itself uses, not a separate approximation of it.
export function buildTasteModel(reviews, nowSec = Date.now() / 1000) {
  const affinity = {};
  const positiveTraits = new Map();
  const negativeTraits = new Set();
  const softNegativeTraits = new Map();
  for (const r of reviews || []) {
    const rw = recencyWeight(r.updatedAt?.seconds, nowSec);
    const w = (r.tier === 'highly-recommend' ? 3 : r.tier === 'probably-skip' ? -3 : 1) * rw;
    for (const c of r.categories || []) affinity[c] = (affinity[c] || 0) + w;
    const text = [r.name, r.comment, ...(r.highlights || []).map(chipLabel)].filter(Boolean).join(' ');
    for (const kw of keywordsIn(text)) {
      if (r.tier === 'highly-recommend') {
        positiveTraits.set(kw, (positiveTraits.get(kw) || 0) + rw);
      } else if (r.tier === 'probably-skip') {
        if (rw >= 0.35) negativeTraits.add(kw);
        else softNegativeTraits.set(kw, (softNegativeTraits.get(kw) || 0) + rw);
      }
    }
  }
  return { affinity, positiveTraits, negativeTraits, softNegativeTraits };
}

// The model's raw (unbounded) predicted affinity for one review's landmark,
// from a taste model built on OTHER reviews -- category affinity plus
// whatever traits the review's own text/highlights name.
export function predictedAffinityScore(review, model) {
  const cat = review.categories?.[0];
  const text = [review.name, review.comment, ...(review.highlights || []).map(chipLabel)].filter(Boolean).join(' ');
  const kws = keywordsIn(text);
  let traitScore = 0;
  let hardNegative = false;
  for (const kw of kws) {
    if (model.positiveTraits.has(kw)) traitScore += model.positiveTraits.get(kw);
    if (model.softNegativeTraits.has(kw)) traitScore -= model.softNegativeTraits.get(kw);
    if (model.negativeTraits.has(kw)) hardNegative = true;
  }
  const catAffinity = model.affinity[cat] || 0;
  return catAffinity + traitScore + (hardNegative ? -3 : 0);
}

export function localMaprPicks({
  reviews = [],
  interests = [],
  checkedInIds = [],
  // Checked in but never rated -- a real visit is worth something (you
  // didn't hate it enough to skip rating out of spite), but nowhere near
  // as much as an actual verdict. Distinct from checkedInIds, which this
  // function also uses to exclude anywhere already visited from the pool.
  weakCheckedInIds = [],
  regionIds = [],
  origin = null,
  ratings = {},
  feedback = [],
  passedIds = [],
  limit = 4,
  now = Date.now(),
}) {
  const nowSec = now / 1000;
  const affinity = {};
  // keyword -> summed (recency-weighted) strength of "loved it for this".
  const positiveTraits = new Map();
  // keyword -> hard-exclude candidates naming it (recent/strong enough).
  const negativeTraits = new Set();
  // keyword -> summed (decayed) strength of an older/weaker dislike --
  // still counts against a match, just doesn't rule it out outright.
  const softNegativeTraits = new Map();

  // A single clear "probably skip" now counts for noticeably more than a
  // single loved rating pulls the other way -- taste should snap toward a
  // stated dislike fast, not need several repeats to overcome how many
  // things the traveler has loved overall. The comment (and the chip
  // tapped) is the actual REASON, so it's parsed for traits above and
  // beyond the plain category/tier math here.
  for (const r of reviews) {
    const rw = recencyWeight(r.updatedAt?.seconds, nowSec);
    const w = (r.tier === 'highly-recommend' ? 3 : r.tier === 'probably-skip' ? -3 : 1) * rw;
    for (const c of r.categories || []) affinity[c] = (affinity[c] || 0) + w;

    const text = [r.name, r.comment, ...(r.highlights || []).map(chipLabel)].filter(Boolean).join(' ');
    for (const kw of keywordsIn(text)) {
      if (r.tier === 'highly-recommend') {
        positiveTraits.set(kw, (positiveTraits.get(kw) || 0) + rw);
      } else if (r.tier === 'probably-skip') {
        if (rw >= 0.35) negativeTraits.add(kw);
        else softNegativeTraits.set(kw, (softNegativeTraits.get(kw) || 0) + rw);
      }
    }
  }
  for (const c of interests) affinity[c] = (affinity[c] || 0) + 1;
  // A plain check-in with no rating at all: a weak signal, not neutral and
  // not an endorsement either -- a small nudge, well under even a single
  // "worth trying".
  for (const id of weakCheckedInIds) {
    const lm = ALL_LANDMARKS.find((l) => l.id === id);
    for (const c of lm?.categories || []) affinity[c] = (affinity[c] || 0) + 0.5;
  }
  // ✓ / ✗ on earlier picks: a lighter nudge than a rating (±1 per category).
  // A vote carries no comment, so only its landmark's own name can surface
  // a trait -- weaker evidence, so it takes two ✗'s naming the same thing
  // (not one) to rule it out, same as before.
  const noVotesByType = {};
  for (const f of feedback) {
    // "Not sure" carries no taste signal either way -- it only means the
    // landmark shouldn't be re-offered (handled via passedIds), not that it
    // was disliked.
    if (f.verdict !== 'yes' && f.verdict !== 'no') continue;
    const rw = recencyWeight(f.at ? f.at / 1000 : null, nowSec);
    const w = (f.verdict === 'yes' ? 1 : -1) * rw;
    for (const c of f.categories || []) affinity[c] = (affinity[c] || 0) + w;
    if (f.verdict !== 'no') continue;
    for (const kw of keywordsIn(f.name)) {
      noVotesByType[kw] = (noVotesByType[kw] || 0) + 1;
      if (noVotesByType[kw] >= 2) negativeTraits.add(kw);
    }
  }

  const visited = new Set([...checkedInIds, ...passedIds]);
  const cities = new Set(regionIds);
  let pool = ALL_LANDMARKS.filter((l) => {
    if (visited.has(l.id) || !isRateable(l)) return false;
    const kws = keywordsIn(`${l.name} ${l.summary || ''}`);
    return !kws.some((k) => negativeTraits.has(k));
  });
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
    const traitText = `${l.name} ${l.summary || ''}`;
    const kws = keywordsIn(traitText);
    let traitScore = 0;
    for (const kw of kws) {
      if (positiveTraits.has(kw)) traitScore += positiveTraits.get(kw) * 2;
      if (softNegativeTraits.has(kw)) traitScore -= softNegativeTraits.get(kw) * 2;
    }
    // affinity[cat] drives which of these are worth showing at all --
    // ranked by the full score (distance/crowd/popularity as tie-breakers),
    // but see matchPercentage below for why it isn't what sets the %.
    const score = (affinity[cat] || 0) * 2 + crowd * 0.8 + (l.popularity || 0) * 0.15 + near + traitScore;
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
// Bump this whenever a change to the scoring/ranking logic (local or
// server) should force EVERY user's next load to recompute fresh, rather
// than possibly keep serving a list built under the old rules until the
// TTL or ratingsCount happens to change. Old-prefixed entries are simply
// never read again -- harmless dead keys, not worth cleaning up.
const CACHE_VERSION = 'v3';
// tasteFP (tasteQuestions.js's tasteFingerprint) covers everything a
// traveler has told Mapr that ISN'T a landmark rating -- the onboarding/
// Settings taste intro and the taste baseline's like/dislike picks +
// per-category comments. Without it in the key, answering or editing the
// baseline never changed ratingsCount, so Mapr Picks kept serving picks
// computed before those answers existed until the 4-hour TTL happened to
// expire -- exactly the "picks don't reflect what I just told Mapr" bug.
export const picksCacheKey = (uid, ratingsCount, origin, tasteFP = '') =>
  `lh-mapr-picks:${CACHE_VERSION}:${uid}:${ratingsCount}:${tasteFP}:${coarseLocation(origin)}`;

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
