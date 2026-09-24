import { REGIONS } from '../data/regions';

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Which curated region a point falls closest to, by straight-line distance
// to each region's center -- used to file a new landmark under a city.
export function nearestRegionId(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const r of REGIONS) {
    if (r.worldwide) continue; // a catalog like Formula 1 Circuits, not a place
    const d = distanceMeters(lat, lng, r.center.lat, r.center.lng);
    if (d < bestDist) {
      bestDist = d;
      best = r.id;
    }
  }
  return best;
}

// Beyond this, the nearest curated region isn't really where a point is --
// it's just whichever catalog happens to be least far away (e.g. a Swiss
// lake filed under Lake Como, Italy because Italy is the nearest catalog).
const MAX_ATTRIBUTION_DISTANCE_METERS = 100_000;

// Same idea as nearestRegionId, but for permanently attributing a brand-new
// landmark submission to a city: returns null instead of a wrong-country
// guess once nothing curated is actually nearby. Callers that already treat
// a missing region as "Custom pin" (MapExplore) handle that null fine.
// Not used for trip start-location / "browse near me", which should still
// always land on the closest curated city even when it's far away.
export function nearestAttributableRegionId(lat, lng) {
  const id = nearestRegionId(lat, lng);
  if (!id) return null;
  const region = REGIONS.find((r) => r.id === id);
  const d = distanceMeters(lat, lng, region.center.lat, region.center.lng);
  return d <= MAX_ATTRIBUTION_DISTANCE_METERS ? id : null;
}
