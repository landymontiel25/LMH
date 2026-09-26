/**
 * Free-tier geocoding via OpenStreetMap Nominatim (no API key required).
 * Biases results to the trip's region using a viewbox for accuracy.
 * (Live address-search-as-you-type has since moved to Google Places API --
 * see src/lib/places.js -- this file still backs reverse country lookup and
 * the Itinerary starting-location geocode.)
 */
/**
 * Which country a GPS fix is in, as an ISO 3166-1 alpha-2 code ("US", "IT").
 * Nominatim reverse lookup at country zoom -- one call per session, for the
 * automatic imperial/metric choice. Null on any failure; never throws.
 */
export async function reverseCountryCode(lat, lng) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json', zoom: '3' });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const code = data?.address?.country_code;
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function geocodeLocation(text, region) {
  if (!text || !text.trim()) return null;

  const params = new URLSearchParams({
    q: text,
    format: 'json',
    limit: '1',
  });

  if (region?.viewbox) {
    const { minLat, minLng, maxLat, maxLng } = region.viewbox;
    params.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);
    params.set('bounded', '1');
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!results?.length) return region?.center ?? null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return region?.center ?? null;
  }
}

// "Radnor, Pennsylvania, United States" for a GPS fix -- the town Mapr is
// told the traveler is in. Cached per ~1 km so a moving phone doesn't hit
// Nominatim on every message. Null on any failure; never throws.
const localityCache = new Map();
export async function reverseLocality(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (localityCache.has(key)) return localityCache.get(key);
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json', zoom: '14' });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const a = (await res.json())?.address || {};
    const town = a.neighbourhood || a.suburb || a.village || a.town || a.city || a.hamlet || a.county;
    const city = a.city && a.city !== town ? a.city : null;
    const label = [town, city, a.state, a.country].filter(Boolean).join(', ') || null;
    localityCache.set(key, label);
    return label;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
