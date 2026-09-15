/**
 * Free-tier geocoding via OpenStreetMap Nominatim (no API key required).
 * Biases results to the trip's region using a viewbox for accuracy.
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

/**
 * Live-typing address/place suggestions via Nominatim, biased to the trip's region.
 * Returns [{ primary, secondary, lat, lng }] — primary is the place/street name,
 * secondary is the rest of the formatted address.
 */
export async function searchLocations(text, region, limit = 5) {
  if (!text || text.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: text,
    format: 'json',
    limit: String(limit),
    addressdetails: '0',
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
    if (!res.ok) return [];
    const results = await res.json();
    return results.map((r) => {
      const parts = String(r.display_name).split(',');
      return {
        primary: parts[0].trim(),
        secondary: parts.slice(1).join(',').trim(),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      };
    });
  } catch {
    return [];
  }
}
