import { verifyIdToken } from './_lib/verifyAuth.js';
import { isRateLimited } from './_lib/rateLimit.js';
import { enrichLandmark, reverseGeocode } from './_lib/enrichLandmark.js';
import { ADMIN_EMAILS } from '../src/lib/admins.js';

// Deliberately NOT imported from src/lib/customLandmarks.js: that file
// pulls in src/lib/firebase.js, which reads import.meta.env.VITE_* --
// a Vite-only construct. Vercel's serverless function bundler doesn't
// define it, so that import crashes this function before the handler
// even runs (surfacing as an opaque non-JSON failure, not a real error).
// Same check, kept in sync with needsFactsBackfill in customLandmarks.js.
function needsFactsBackfill(landmark) {
  return typeof landmark?.summary === 'string' && landmark.summary.startsWith('A community-submitted spot');
}

// Admin-only, manually triggered from Profile's "Backfill AI Facts" panel.
// Re-runs the same AI research /api/verify-landmark does on new submissions
// against existing custom_landmarks docs that still carry the generic
// filler text -- i.e. ones added before AI_ENRICHMENT_ENABLED shipped, or
// that hit its fallback path at the time.
//
// No firebase-admin here (same reasoning as verifyAuth.js -- no
// service-account secret this project has set up): reads and writes go
// through the Firestore REST API using the caller's own ID token, so
// firestore.rules' normal "admin can change anything on custom_landmarks"
// rule is what actually authorizes the writes -- this endpoint's own admin
// check is a second gate, not a bypass of that.
const MAX_PER_RUN = 15;

function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function encodeValue(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { nullValue: null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel.' });
    return;
  }
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    res.status(503).json({ error: 'Firebase is not set up yet.' });
    return;
  }

  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const account = await verifyIdToken(req);
  if (!account) {
    res.status(401).json({ error: 'Sign in first.' });
    return;
  }
  if (!ADMIN_EMAILS.includes((account.email || '').toLowerCase())) {
    res.status(403).json({ error: 'Admin only.' });
    return;
  }
  if (isRateLimited(req, 'backfill-landmark-facts', { limit: 3, windowMs: 30 * 60 * 1000 })) {
    res.status(429).json({ error: 'Too many backfill runs in a row — try again later.' });
    return;
  }

  try {
    const listRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/custom_landmarks?pageSize=300`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (!listRes.ok) {
      res.status(502).json({ error: 'Could not list submitted landmarks.' });
      return;
    }
    const listData = await listRes.json();
    const docs = listData.documents || [];

    const candidates = docs.filter((doc) => needsFactsBackfill(decodeFields(doc.fields))).slice(0, MAX_PER_RUN);

    let updated = 0;
    const errors = [];

    for (const doc of candidates) {
      const data = decodeFields(doc.fields);
      const userFacts = Array.isArray(data.facts) ? data.facts : [];
      try {
        const placeContext = await reverseGeocode(data.lat, data.lng);
        const enriched = await enrichLandmark({ name: data.name, lat: data.lat, lng: data.lng, userFacts, placeContext });

        const patchRes = await fetch(
          `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=summary&updateMask.fieldPaths=facts&updateMask.fieldPaths=free`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                summary: encodeValue(enriched.summary),
                facts: encodeValue(enriched.facts),
                free: encodeValue(enriched.free),
              },
            }),
          }
        );
        if (!patchRes.ok) throw new Error(`Firestore write failed (${patchRes.status})`);
        updated++;
      } catch (e) {
        errors.push({ name: data.name, error: e.message || 'unknown error' });
      }
    }

    const totalCandidates = docs.filter((doc) => needsFactsBackfill(decodeFields(doc.fields))).length;
    res.status(200).json({
      total: totalCandidates,
      updated,
      remaining: Math.max(0, totalCandidates - updated),
      errors,
    });
  } catch {
    res.status(500).json({ error: 'Backfill failed. Try again.' });
  }
}
