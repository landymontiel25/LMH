// Cross-checks every landmark's lat/lng in src/data/landmarks.*.js against
// Nominatim (OpenStreetMap) -- the same geocoding service src/lib/geocode.js
// already uses for the app's own address search -- and patches the ones that
// are off. Writes a Markdown report of exactly what changed and what was
// left alone, and why.
//
//   node scripts/fix-landmark-coordinates.mjs                 # all regions
//   node scripts/fix-landmark-coordinates.mjs --region=villanova
//   node scripts/fix-landmark-coordinates.mjs --dry-run       # report only
//
// Needs a machine with normal internet access (a cloud session here is
// blocked from nominatim.openstreetmap.org by the network egress policy).
//
// Guards, because Nominatim is not always right (it once put "Ocean Drive"
// in Key Biscayne and "Calle Ocho" downtown):
//   - the matched place name must actually resemble the landmark name
//   - a move larger than MAX_MOVE_METERS is flagged for review, not applied
//   - a move smaller than MIN_MOVE_METERS counts as "already correct"
// Anything not applied is listed in the report so it can get a manual look.
import { readFile, writeFile } from 'node:fs/promises';
import { REGIONS } from '../src/data/regions.js';
import { distanceMeters } from '../src/lib/geo.js';

const NOMINATIM_BASE = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org';
const DELAY_MS = process.env.NOMINATIM_DELAY_MS != null ? Number(process.env.NOMINATIM_DELAY_MS) : 1100; // usage policy: max 1 req/s
const MIN_MOVE_METERS = 5;
const MAX_MOVE_METERS = 2000;
const MIN_NAME_SIMILARITY = 0.5;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_REGION = args.find((a) => a.startsWith('--region='))?.slice('--region='.length) || null;

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
  const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'landmark-hunters-data-fix/1.0 (one-off script)' },
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results?.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), name: results[0].display_name };
}

// Fraction of the landmark's meaningful words that show up in what Nominatim
// matched. "Falvey Memorial Library" vs "Falvey Memorial Library, Villanova,
// ..." -> 1.0; vs "Southeast 8th Street, Torch of Friendship" -> 0.
function nameSimilarity(landmarkName, matchedName) {
  const norm = (s) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const want = norm(landmarkName);
  if (want.length === 0) return 0;
  const have = new Set(norm(matchedName));
  return want.filter((w) => have.has(w)).length / want.length;
}

const report = { updated: [], unchanged: [], largeMove: [], nameMismatch: [], noMatch: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const region of REGIONS) {
  if (ONLY_REGION && region.id !== ONLY_REGION) continue;
  const file = FILE_FOR_REGION[region.id];
  if (!file) {
    console.warn(`No data file mapped for region "${region.id}" -- skipping its landmarks.`);
    continue;
  }
  const path = new URL(`../src/data/${file}`, import.meta.url);
  let text = await readFile(path, 'utf8');
  let changed = false;

  for (const l of region.landmarks) {
    const query = `${l.name}, ${region.city}, ${region.country}`;
    const match = await geocode(query, region.viewbox);
    if (DELAY_MS > 0) await sleep(DELAY_MS);
    const row = { region: region.id, id: l.id, name: l.name, old: [l.lat, l.lng] };

    if (!match) {
      report.noMatch.push(row);
      continue;
    }
    row.new = [match.lat, match.lng];
    row.matched = match.name;
    row.meters = Math.round(distanceMeters(l.lat, l.lng, match.lat, match.lng));
    row.similarity = nameSimilarity(l.name, match.name);

    if (row.similarity < MIN_NAME_SIMILARITY) {
      report.nameMismatch.push(row);
      continue;
    }
    if (row.meters < MIN_MOVE_METERS) {
      report.unchanged.push(row);
      continue;
    }
    if (row.meters > MAX_MOVE_METERS) {
      report.largeMove.push(row);
      continue;
    }

    // Each landmark object's `id:` line is unique in the file, and `lat`/`lng`
    // are the very next occurrence of those keys after it -- safe to target
    // with a bounded lazy match given this file's consistent formatting.
    const idPattern = new RegExp(`(id:\\s*'${l.id}'[\\s\\S]*?lat:\\s*)[-0-9.]+(,[\\s\\S]*?lng:\\s*)[-0-9.]+`);
    if (!idPattern.test(text)) {
      row.matched += ' (could not locate lat/lng lines in file)';
      report.noMatch.push(row);
      continue;
    }
    text = text.replace(idPattern, `$1${match.lat}$2${match.lng}`);
    changed = true;
    report.updated.push(row);
    console.log(`${region.id}/${l.id}: moved ${row.meters} m`);
  }

  if (changed && !DRY_RUN) {
    await writeFile(path, text, 'utf8');
    console.log(`Wrote ${file}`);
  }
}

const fmt = (c) => `${c[0]}, ${c[1]}`;
const section = (title, rows, line) =>
  rows.length ? `\n## ${title} (${rows.length})\n\n${rows.map(line).join('\n')}\n` : `\n## ${title} (0)\n`;

const total = Object.values(report).reduce((n, rows) => n + rows.length, 0);
const md =
  `# Landmark coordinate cross-check${DRY_RUN ? ' (dry run — no files written)' : ''}\n\n` +
  `${new Date().toISOString()} · ${total} landmarks checked${ONLY_REGION ? ` · region: ${ONLY_REGION}` : ''}\n` +
  `Source: ${NOMINATIM_BASE} · applied when name similarity ≥ ${MIN_NAME_SIMILARITY} and move is ${MIN_MOVE_METERS}–${MAX_MOVE_METERS} m\n` +
  section('Updated', report.updated, (r) => `- **${r.region}/${r.id}** — ${fmt(r.old)} → ${fmt(r.new)} (${r.meters} m) · matched "${r.matched}"`) +
  section('Already correct (< ' + MIN_MOVE_METERS + ' m)', report.unchanged, (r) => `- ${r.region}/${r.id} — ${r.meters} m`) +
  section('Large move flagged, NOT applied (> ' + MAX_MOVE_METERS + ' m)', report.largeMove, (r) => `- **${r.region}/${r.id}** — ${fmt(r.old)} → ${fmt(r.new)} (${r.meters} m) · matched "${r.matched}"`) +
  section('Name mismatch, NOT applied', report.nameMismatch, (r) => `- **${r.region}/${r.id}** — "${r.name}" vs "${r.matched}" (similarity ${r.similarity.toFixed(2)}, ${r.meters} m)`) +
  section('No match from Nominatim', report.noMatch, (r) => `- ${r.region}/${r.id} — "${r.name}"${r.matched ? ' · ' + r.matched : ''}`);

const reportPath = new URL('./coordinate-report.md', import.meta.url);
await writeFile(reportPath, md, 'utf8');
console.log(
  `\nUpdated ${report.updated.length} · already correct ${report.unchanged.length} · flagged ${report.largeMove.length + report.nameMismatch.length} · no match ${report.noMatch.length}` +
  `\nReport: scripts/coordinate-report.md`
);
