import { distanceMeters } from './geo';
import { readPersisted, writePersisted } from './usePersistentState';

// "Mapr should learn where I go daily" -- entirely on-device pattern
// detection over live GPS fixes the app already has open (GeoContext),
// no new tracking, no location sent anywhere except the one-time lookup
// that names a place once it's visited enough to matter (see
// api/places-nearby.js). Nothing here runs while the app is closed --
// there's no real background location or push wired up (see
// src/lib/notifications.js), so this only notices a pattern while you
// have the app open, the same way a live GPS trail always has.
//
// A "cluster" is a real-world spot: a running centroid, which distinct
// calendar days (local time) it's been visited on, and -- once resolved --
// its name. Reaching MIN_DAYS distinct days is what turns "I drove past
// here twice" into "I keep going here."
const MERGE_RADIUS_METERS = 60;
const MIN_ACCURACY_METERS = 120; // a fix vaguer than this would blur clusters together
const MAX_CLUSTERS = 40;
const MAX_DAYS_STORED = 60;
const MAX_HOURS_STORED = 30;
export const MIN_DAYS_TO_SUGGEST = 3;
const GLOBAL_COOLDOWN_MS = 20 * 60 * 60 * 1000; // at most ~once a day, across every place
const LOOKUP_RETRY_MS = 3 * 24 * 60 * 60 * 1000; // a failed name lookup gets tried again in a few days
const CLUSTER_STALE_MS = 45 * 24 * 60 * 60 * 1000; // not seen in this long -> forget it

function storageKey(uid) {
  return `habits.${uid}`;
}

function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function load(uid) {
  const data = readPersisted(storageKey(uid));
  return data && Array.isArray(data.clusters) ? data : { clusters: [], lastPromptAt: 0 };
}

function save(uid, data) {
  writePersisted(storageKey(uid), data);
}

function newCluster(lat, lng, now) {
  return {
    id: `h${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    lat,
    lng,
    count: 1,
    days: [localDay(now)],
    hours: [now.getHours()],
    firstSeenAt: now.getTime(),
    lastSeenAt: now.getTime(),
    name: null,
    address: null,
    placeId: null,
    lookupTried: false,
    lookupFailedAt: null,
    status: 'new', // new -> suggested (asked at least once) -> added | dismissed
    lastPromptedAt: null,
  };
}

/**
 * Folds one live GPS fix into the on-device habit log. Cheap and safe to
 * call on every GeoContext update -- callers should still throttle how
 * often that fires (a fix every few seconds would spam identical merges
 * for no benefit), but this function itself does nothing expensive.
 */
export function recordVisit(uid, { lat, lng, accuracy } = {}, now = new Date()) {
  if (!uid || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (Number.isFinite(accuracy) && accuracy > MIN_ACCURACY_METERS) return;

  const data = load(uid);
  let best = null;
  let bestDist = Infinity;
  for (const c of data.clusters) {
    const d = distanceMeters(lat, lng, c.lat, c.lng);
    if (d <= MERGE_RADIUS_METERS && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }

  if (best) {
    // Running average centroid, weighted by how many fixes it's already seen.
    best.lat = (best.lat * best.count + lat) / (best.count + 1);
    best.lng = (best.lng * best.count + lng) / (best.count + 1);
    best.count += 1;
    best.lastSeenAt = now.getTime();
    const day = localDay(now);
    if (!best.days.includes(day)) {
      best.days.push(day);
      if (best.days.length > MAX_DAYS_STORED) best.days = best.days.slice(-MAX_DAYS_STORED);
    }
    best.hours.push(now.getHours());
    if (best.hours.length > MAX_HOURS_STORED) best.hours = best.hours.slice(-MAX_HOURS_STORED);
  } else {
    data.clusters.push(newCluster(lat, lng, now));
  }

  // Bound storage: drop whatever's gone stale first, then -- if still over
  // the cap -- the least-established cluster (fewest distinct days), so an
  // actual habit always outlives a one-off blip.
  data.clusters = data.clusters.filter((c) => now.getTime() - c.lastSeenAt <= CLUSTER_STALE_MS);
  if (data.clusters.length > MAX_CLUSTERS) {
    data.clusters.sort((a, b) => b.days.length - a.days.length || b.lastSeenAt - a.lastSeenAt);
    data.clusters = data.clusters.slice(0, MAX_CLUSTERS);
  }

  save(uid, data);
}

/**
 * The one cluster (if any) worth surfacing right now: you're standing on
 * it, it's shown up on enough different days to be a real pattern, and
 * nothing about it has already been handled. `isAlreadyTracked(lat, lng)`
 * lets the caller skip anything already a real landmark or already on an
 * itinerary -- Mapr shouldn't "discover" a place you've already added.
 */
export function getDueSuggestion(uid, coords, { isAlreadyTracked, now = new Date() } = {}) {
  if (!uid || !coords) return null;
  const data = load(uid);
  if (now.getTime() - (data.lastPromptAt || 0) < GLOBAL_COOLDOWN_MS) return null;

  const candidates = data.clusters.filter((c) => {
    if (c.status === 'dismissed' || c.status === 'added') return false;
    if (c.days.length < MIN_DAYS_TO_SUGGEST) return false;
    if (distanceMeters(coords.lat, coords.lng, c.lat, c.lng) > MERGE_RADIUS_METERS) return false;
    if (isAlreadyTracked?.(c.lat, c.lng)) return false;
    // Needs a name to say anything useful; a lookup that hasn't been tried
    // yet is fine (the caller triggers it), one that failed gets a cooldown
    // before trying again rather than hammering the API every visit.
    if (!c.name && c.lookupTried && now.getTime() - (c.lookupFailedAt || 0) < LOOKUP_RETRY_MS) return false;
    return true;
  });
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.days.length - a.days.length);
  return candidates[0];
}

/** A rough "most mornings around 7-9am" -- cosmetic context for the prompt, not a gate. */
export function typicalTimeLabel(cluster) {
  const hours = cluster?.hours || [];
  if (hours.length < 2) return '';
  const sorted = [...hours].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.2)];
  const hi = sorted[Math.ceil(sorted.length * 0.8) - 1] ?? lo;
  const fmt = (h) => {
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${period}`;
  };
  return lo === hi ? `around ${fmt(lo)}` : `between ${fmt(lo)} and ${fmt(hi)}`;
}

function update(uid, clusterId, patch) {
  const data = load(uid);
  const c = data.clusters.find((x) => x.id === clusterId);
  if (!c) return;
  Object.assign(c, typeof patch === 'function' ? patch(c) : patch);
  save(uid, data);
}

/** Marks that a cluster has just been shown to the user (starts the global cooldown). */
export function recordPrompted(uid, clusterId, now = new Date()) {
  const data = load(uid);
  const c = data.clusters.find((x) => x.id === clusterId);
  if (c) {
    c.status = c.status === 'new' ? 'suggested' : c.status;
    c.lastPromptedAt = now.getTime();
  }
  data.lastPromptAt = now.getTime();
  save(uid, data);
}

export function resolveClusterName(uid, clusterId, { name, address, placeId }) {
  update(uid, clusterId, { name, address: address || null, placeId: placeId || null, lookupTried: true });
}

export function markLookupFailed(uid, clusterId, now = new Date()) {
  update(uid, clusterId, { lookupTried: true, lookupFailedAt: now.getTime() });
}

export function markClusterAdded(uid, clusterId) {
  update(uid, clusterId, { status: 'added' });
}

export function dismissCluster(uid, clusterId) {
  update(uid, clusterId, { status: 'dismissed' });
}

// Test/debug helper -- not used by the app itself.
export function _clearHabits(uid) {
  save(uid, { clusters: [], lastPromptAt: 0 });
}
