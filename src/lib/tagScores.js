import { ALL_LANDMARKS } from '../data/regions.js';

// Per-region tag scoring for Mapr Picks. A "tag" is a landmark's category id
// (food, history-culture, ...), the same ids signup interests use. Everything
// here is scoped to one region: Milan's "history" never touches Miami's.
//
// Firestore shape on users/{uid}:
//   tagScores[region][tag]   = score as of tagScoresAt (never above TAG_CAP)
//   tagScoresAt[region][tag] = ms timestamp that score was last written
//   tagBoosts[region][tag]   = 'yes' | 'no' -- answer to the at-cap prompt
//   tagNotes[region][tag]    = free-text comment from that prompt
//
// Exponential decay is linear, so decaying one running total from its last
// write equals decaying every rating from its own timestamp and summing.
// That lets us store one number per tag instead of every contribution.
// Plain .js import paths: api/mapr-picks.js runs this under Node on Vercel.

export const TAG_DELTAS = { 'highly-recommend': 10, 'worth-trying': 2, 'probably-skip': -15 };
export const HALF_LIFE_DAYS = 90;
export const TAG_CAP = 100;
export const BOOST_MULTIPLIER = 1.5;
export const SHORTLIST_SIZE = 30;
// Most shortlist slots one tag can take, so a top category can't fill all
// 30 by itself. A tag the user said "lean into it" to gets 1.5x the room.
export const PER_TAG_LIMIT = 12;
// Bump when the stored shape or deltas change, so clients rebuild from reviews.
export const TAG_SCORES_VERSION = 1;

const DAY_MS = 86400000;
const UNRATEABLE = new Set(['dorms', 'campus-life']);

export function decayFactor(fromMs, nowMs) {
  if (!fromMs) return 1;
  const ageDays = Math.max(0, nowMs - fromMs) / DAY_MS;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

// One rating applied to one region's tag map. Returns only the tags it
// touched, plus which of them landed on the cap, so callers can merge-write.
export function applyRating({ scores = {}, at = {} }, tags, tier, nowMs) {
  const delta = TAG_DELTAS[tier];
  const nextScores = {};
  const nextAt = {};
  const capped = [];
  if (delta == null) return { scores: nextScores, at: nextAt, capped };
  for (const tag of new Set(tags || [])) {
    const base = (scores[tag] || 0) * decayFactor(at[tag], nowMs);
    const value = Math.min(TAG_CAP, base + delta);
    nextScores[tag] = value;
    nextAt[tag] = nowMs;
    if (value >= TAG_CAP) capped.push(tag);
  }
  return { scores: nextScores, at: nextAt, capped };
}

// Replays a user's saved reviews oldest-first through applyRating, for users
// who rated before tagScores existed. Same math as the live path.
export function rebuildTagScores(reviews) {
  const toMs = (r) => (r.updatedAt?.seconds ? r.updatedAt.seconds * 1000 : r.updatedAtMs || 0);
  const tagScores = {};
  const tagScoresAt = {};
  const ordered = [...(reviews || [])].sort((a, b) => toMs(a) - toMs(b));
  for (const r of ordered) {
    const region = r.region;
    if (!region || !TAG_DELTAS[r.ratingTier]) continue;
    const when = toMs(r) || Date.now();
    const cur = { scores: tagScores[region] || {}, at: tagScoresAt[region] || {} };
    const next = applyRating(cur, r.categories, r.ratingTier, when);
    tagScores[region] = { ...cur.scores, ...next.scores };
    tagScoresAt[region] = { ...cur.at, ...next.at };
  }
  return { tagScores, tagScoresAt };
}

// Decayed, capped scores for one region, with a 1.5x multiplier on any tag
// the user said "yes, lean into it" to. Only this ranking view can exceed
// the cap; the stored score never does.
export function effectiveTagScores(profile, region, nowMs = Date.now()) {
  const scores = profile?.tagScores?.[region] || {};
  const at = profile?.tagScoresAt?.[region] || {};
  const boosts = profile?.tagBoosts?.[region] || {};
  const out = {};
  for (const [tag, raw] of Object.entries(scores)) {
    const decayed = Math.min(TAG_CAP, Number(raw) || 0) * decayFactor(at[tag], nowMs);
    out[tag] = boosts[tag] === 'yes' ? decayed * BOOST_MULTIPLIER : decayed;
  }
  return out;
}

// The first region/tag sitting at the cap that the user hasn't answered the
// "lean into it?" prompt for yet. Null when there's nothing to ask.
export function pendingCapPrompt(profile) {
  const all = profile?.tagScores || {};
  for (const [region, tags] of Object.entries(all)) {
    for (const [tag, score] of Object.entries(tags || {})) {
      if (score >= TAG_CAP && !profile?.tagBoosts?.[region]?.[tag]) return { region, tag };
    }
  }
  return null;
}

// Region the traveler is in: nearest landmark's region to a GPS fix, else
// the region they were last planning or rating.
export function pickRegion({ origin, fallbackRegions = [] }) {
  if (origin) {
    let best = null;
    let bestD = Infinity;
    for (const l of ALL_LANDMARKS) {
      const d = (l.lat - origin.lat) ** 2 + ((l.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = l.regionId;
      }
    }
    if (best) return best;
  }
  return fallbackRegions.find(Boolean) || null;
}

function candidates(region, excludeIds) {
  const exclude = new Set(excludeIds || []);
  return ALL_LANDMARKS.filter(
    (l) => l.regionId === region && !exclude.has(l.id) && !(l.categories || []).every((c) => UNRATEABLE.has(c))
  );
}

const byDemand = (checkinCounts) => (a, b) =>
  (checkinCounts[b.id] || 0) - (checkinCounts[a.id] || 0) || (b.popularity || 0) - (a.popularity || 0);

// Step 6: sum the user's effective tag scores over each landmark's tags and
// keep the top SHORTLIST_SIZE, at most PER_TAG_LIMIT per tag. Ties (same
// tag) break on check-in count, then the catalog's editorial popularity.
// Places held back by the per-tag limit fill any slots left over, so a
// small region still returns a full list.
export function scoreShortlist({
  scores,
  region,
  excludeIds = [],
  checkinCounts = {},
  boostedTags = [],
  limit = SHORTLIST_SIZE,
}) {
  const demand = byDemand(checkinCounts);
  const boosted = new Set(boostedTags);
  const tagLimit = (tag) => (boosted.has(tag) ? Math.round(PER_TAG_LIMIT * BOOST_MULTIPLIER) : PER_TAG_LIMIT);
  const ranked = candidates(region, excludeIds)
    .map((l) => ({ l, score: (l.categories || []).reduce((s, t) => s + (scores[t] || 0), 0) }))
    .sort((a, b) => b.score - a.score || demand(a.l, b.l));
  const perTag = {};
  const kept = [];
  const heldBack = [];
  for (const item of ranked) {
    const tag = item.l.categories?.[0];
    if ((perTag[tag] || 0) < tagLimit(tag)) {
      perTag[tag] = (perTag[tag] || 0) + 1;
      kept.push(item);
    } else {
      heldBack.push(item);
    }
    if (kept.length >= limit) break;
  }
  return [...kept, ...heldBack]
    .slice(0, limit)
    .map(({ l, score }) => ({ ...l, tagScore: Math.round(score * 10) / 10 }));
}

// Step 8: no rating signal in this region yet. Landmarks in the user's
// signup interests (built-in category ids, plus any landmarks their custom
// "Add Your Own" interests matched) come first, most-checked-in first. The
// rest of the region fills out the shortlist in the same order.
export function coldStartShortlist({
  region,
  interests = [],
  customMatchIds = [],
  excludeIds = [],
  checkinCounts = {},
  limit = SHORTLIST_SIZE,
}) {
  const wanted = new Set(interests);
  const custom = new Set(customMatchIds);
  const fits = (l) => custom.has(`${l.regionId}/${l.id}`) || (l.categories || []).some((c) => wanted.has(c));
  const pool = candidates(region, excludeIds).sort(byDemand(checkinCounts));
  return [...pool.filter(fits), ...pool.filter((l) => !fits(l))].slice(0, limit).map((l) => ({ ...l, tagScore: 0 }));
}

const boostedTagsFor = (profile, region) =>
  Object.entries(profile?.tagBoosts?.[region] || {})
    .filter(([, answer]) => answer === 'yes')
    .map(([tag]) => tag);

export function buildShortlist({ profile, region, now = Date.now(), ...rest }) {
  const scores = effectiveTagScores(profile, region, now);
  const hasSignal = Object.values(scores).some((v) => Math.abs(v) > 0.01);
  return {
    coldStart: !hasSignal,
    shortlist: hasSignal
      ? scoreShortlist({ scores, region, boostedTags: boostedTagsFor(profile, region), ...rest })
      : coldStartShortlist({ region, ...rest }),
  };
}
