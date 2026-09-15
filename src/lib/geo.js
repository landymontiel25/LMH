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
