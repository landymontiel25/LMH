// One-off fix for the Villanova pin-location bug (see the "Villanova landmark
// pin coordinates are significantly off" issue): looks up real coordinates
// for each Villanova landmark via Nominatim, the same free geocoding service
// src/lib/geocode.js already uses for the app's own address search.
//
// Run from a machine with normal internet access (this can't reach the web
// from a locked-down cloud session):
//   node scripts/geocode-villanova.mjs
// Paste the output back so the lat/lng values in
// src/data/landmarks.villanova.js can be corrected.
const VIEWBOX = { minLat: 40.025, minLng: -75.355, maxLat: 40.048, maxLng: -75.33 };

const QUERIES = [
  { id: 'st-thomas-of-villanova-church', q: 'St. Thomas of Villanova Church, Villanova University, PA' },
  { id: 'the-villanova-grotto', q: 'Villanova Grotto, Villanova University, PA' },
  { id: 'corr-hall-arch', q: 'Corr Hall, Villanova University, PA' },
  { id: 'the-awakening-the-oreo', q: 'The Awakening sculpture, Villanova University, PA' },
  { id: 'riley-ellipse', q: 'Riley Ellipse, Villanova University, PA' },
  { id: 'mendel-field', q: 'Mendel Hall, Villanova University, PA' },
  { id: 'falvey-memorial-library', q: 'Falvey Memorial Library, Villanova University, PA' },
  { id: 'finneran-pavilion', q: 'William B. Finneran Pavilion, Villanova University, PA' },
  { id: 'villanova-stadium', q: 'Villanova Stadium, Villanova University, PA' },
];

async function geocode(q) {
  const params = new URLSearchParams({ q, format: 'json', limit: '1' });
  const { minLat, minLng, maxLat, maxLng } = VIEWBOX;
  params.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);
  params.set('bounded', '1');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'landmark-hunters-data-fix/1.0 (one-off script)' },
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results?.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), name: results[0].display_name };
}

for (const { id, q } of QUERIES) {
  const r = await geocode(q);
  console.log(id, '|', q, '=>', r ? `${r.lat}, ${r.lng} (${r.name})` : 'NO MATCH — needs a manual lookup');
  await new Promise((res) => setTimeout(res, 1100)); // Nominatim usage policy: max 1 req/sec
}
