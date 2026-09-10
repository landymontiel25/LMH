import { REGIONS } from '../src/data/regions.js';

// One batch of the landmark-coordinate fix (see the "landmark pin coordinates
// are off" issue). Runs on Vercel, which has normal internet access, unlike
// the dev session that wrote this -- that's the whole reason this is a
// server endpoint instead of a local script. Geocodes a slice of the full
// catalog via Nominatim, the same service src/lib/geocode.js already uses
// for the app's own address search. Batched (not all 151 landmarks in one
// call) to stay under the function's time limit, since Nominatim's usage
// policy caps requests at 1/second. Not linked from anywhere in the app --
// visited directly, once per batch, to pull the results back out.
export const maxDuration = 60;

const ALL = REGIONS.flatMap((r) =>
  r.landmarks.map((l) => ({
    regionId: r.id,
    id: l.id,
    name: l.name,
    query: `${l.name}, ${r.city}, ${r.country}`,
    viewbox: r.viewbox,
  }))
);

async function geocode(q, viewbox) {
  const params = new URLSearchParams({ q, format: 'json', limit: '1' });
  if (viewbox) {
    const { minLat, minLng, maxLat, maxLng } = viewbox;
    params.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);
    params.set('bounded', '1');
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'landmark-hunters-data-fix/1.0 (one-off fix)' },
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results?.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), matchedName: results[0].display_name };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const source = req.method === 'GET' ? req.query : typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const start = Math.max(0, parseInt(source.start, 10) || 0);
  const count = Math.min(40, Math.max(1, parseInt(source.count, 10) || 40));
  const batch = ALL.slice(start, start + count);

  const results = [];
  for (const l of batch) {
    const match = await geocode(l.query, l.viewbox);
    results.push({ region: l.regionId, id: l.id, name: l.name, match });
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim usage policy: max 1 req/sec
  }

  res.status(200).json({ start, returned: batch.length, total: ALL.length, results });
}
