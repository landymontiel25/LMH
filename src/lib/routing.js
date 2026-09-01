import { distanceMeters } from './geo';

// Rough average speeds for a mixed walk/transit/drive city trip.
const WALK_SPEED_MPS = 1.3; // ~4.7 km/h
const DRIVE_SPEED_MPS = 8.3; // ~30 km/h incl. stops/parking

export function estimateTravelMinutes(meters) {
  const speed = meters > 1200 ? DRIVE_SPEED_MPS : WALK_SPEED_MPS;
  const seconds = meters / speed;
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * Nearest-neighbor route: starting at `origin` ({lat,lng}), repeatedly hop to the
 * closest not-yet-visited landmark. Returns landmarks in visit order, each annotated
 * with distanceFromPrevMeters and travelMinutesFromPrev.
 */
export function buildNearestNeighborRoute(origin, landmarks) {
  const remaining = [...landmarks];
  const ordered = [];
  let current = origin;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceMeters(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push({
      ...next,
      distanceFromPrevMeters: Math.round(bestDist),
      travelMinutesFromPrev: estimateTravelMinutes(bestDist),
    });
    current = next;
  }

  return ordered;
}

/**
 * "Near Me" ordering: sort landmarks by straight-line distance from `origin`
 * (your current location), nearest first — so the top stop is always the one to
 * go to next. Each is annotated with distanceFromMeMeters + travelMinutesFromMe.
 */
export function buildNearestFirstList(origin, landmarks) {
  return landmarks
    .map((l) => {
      const d = Math.round(distanceMeters(origin.lat, origin.lng, l.lat, l.lng));
      return { ...l, distanceFromMeMeters: d, travelMinutesFromMe: estimateTravelMinutes(d) };
    })
    .sort((a, b) => a.distanceFromMeMeters - b.distanceFromMeMeters);
}

const OSRM_DRIVING_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Real road-based driving distance/duration between two points, via the free public
 * OSRM demo server (no API key). Returns null on any failure so callers can fall back
 * to the straight-line estimate.
 */
export async function fetchDrivingRoute(origin, dest) {
  try {
    const url = `${OSRM_DRIVING_BASE}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const leg = data?.routes?.[0];
    if (!leg) return null;
    return { distanceMeters: Math.round(leg.distance), durationSeconds: leg.duration };
  } catch {
    return null;
  }
}

/**
 * Replaces each drive-length leg's straight-line estimate with a real road-based
 * distance/duration from OSRM. Walking-length legs keep the straight-line estimate
 * (the free OSRM demo only reliably serves driving routes). Legs where OSRM fails
 * (offline, rate-limited) silently keep their straight-line estimate too.
 */
export async function enhanceRouteWithDrivingTimes(origin, route) {
  return Promise.all(
    route.map(async (stop, idx) => {
      if (stop.distanceFromPrevMeters <= 1200) return stop;
      const prev = idx === 0 ? origin : route[idx - 1];
      const real = await fetchDrivingRoute(prev, stop);
      if (!real) return stop;
      return {
        ...stop,
        distanceFromPrevMeters: real.distanceMeters,
        travelMinutesFromPrev: Math.max(1, Math.round(real.durationSeconds / 60)),
      };
    })
  );
}

export function mapsDeepLink(destination, destLat, destLng) {
  const dest = destLat != null && destLng != null ? `${destLat},${destLng}` : encodeURIComponent(destination);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    return `https://maps.apple.com/?daddr=${dest}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
