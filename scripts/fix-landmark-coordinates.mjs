// Re-derives real coordinates for every landmark in every region and patches
// the lat/lng values directly in src/data/landmarks.*.js.
//
// Uses Nominatim (OpenStreetMap) -- the same free geocoding service
// src/lib/geocode.js already uses for the app's own address search -- as the
// real-world source of truth, the same role Esri's basemap "red name" labels
// play visually on the map.
//
// Run from a machine with normal internet access (a cloud session here can't
// reach the open web -- confirmed blocked against nominatim.openstreetmap.org,
// openstreetmap.org, and en.wikipedia.org):
//   node scripts/fix-landmark-coordinates.mjs
//
// It edits the data files in place. Review with `git diff` before committing
// -- a landmark Nominatim can't find (small/unofficial spots like a campus
// sculpture or lawn) is left untouched and listed at the end for a manual look.
import { readFile, writeFile } from 'node:fs/promises';
import { REGIONS } from '../src/data/regions.js';

const FILE_FOR_REGION = {
  miami: 'landmarks.miami.js',
  madrid: 'landmarks.madrid.js',
  'el-escorial': 'landmarks.elescorial.js',
  aranjuez: 'landmarks.aranjuez.js',
  milan: 'landmarks.milan.js',
  'lake-como': 'landmarks.lakecomo.js',
  philly: 'landmarks.philly.js',
  villanova: 'landmarks.villanova.js',
  frankfurt: 'landmarks.frankfurt.js',
};

async function geocode(q, viewbox) {
  const params = new URLSearchParams({ q, format: 'json', limit: '1' });
  if (viewbox) {
    const { minLat, minLng, maxLat, maxLng } = viewbox;
    params.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);
    params.set('bounded', '1');
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'landmark-hunters-data-fix/1.0 (one-off script)' },
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results?.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), name: results[0].display_name };
}

const skipped = [];
const patched = [];

for (const region of REGIONS) {
  const file = FILE_FOR_REGION[region.id];
  if (!file) {
    console.warn(`No data file mapped for region "${region.id}" -- skipping its landmarks.`);
    continue;
  }
  const path = new URL(`../src/data/${file}`, import.meta.url);
  let text = await readFile(path, 'utf8');

  for (const l of region.landmarks) {
    const query = `${l.name}, ${region.city}, ${region.country}`;
    const match = await geocode(query, region.viewbox);
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim usage policy: max 1 req/sec

    if (!match) {
      skipped.push(`${region.id}/${l.id} -- "${query}" -- NO MATCH, left as-is`);
      continue;
    }

    // Each landmark object's `id:` line is unique in the file, and `lat`/`lng`
    // are the very next occurrence of those keys after it -- safe to target
    // with a bounded lazy match given this file's consistent formatting.
    const idPattern = new RegExp(`(id:\\s*'${l.id}'[\\s\\S]*?lat:\\s*)[-0-9.]+(,[\\s\\S]*?lng:\\s*)[-0-9.]+`);
    if (!idPattern.test(text)) {
      skipped.push(`${region.id}/${l.id} -- found a geocode match but couldn't locate its lat/lng in ${file}`);
      continue;
    }
    text = text.replace(idPattern, `$1${match.lat}$2${match.lng}`);
    patched.push(`${region.id}/${l.id} -- "${query}" => ${match.lat}, ${match.lng} (${match.name})`);
  }

  await writeFile(path, text, 'utf8');
  console.log(`Wrote ${file}`);
}

console.log(`\nPatched ${patched.length} landmark(s):`);
patched.forEach((line) => console.log('  ' + line));
console.log(`\nSkipped ${skipped.length} landmark(s) -- review manually:`);
skipped.forEach((line) => console.log('  ' + line));
