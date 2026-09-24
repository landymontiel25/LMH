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
  const summary = typeof landmark?.summary === 'string' ? landmark.summary : '';
  const facts = Array.isArray(landmark?.facts) ? landmark.facts : [];
  const hasCiteTags = /<\/?cite\b/i.test(summary) || facts.some((f) => typeof f === 'string' && /<\/?cite\b/i.test(f));
  return summary.startsWith('A community-submitted spot') || hasCiteTags;
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

  // Optional: force a specific doc through enrichment regardless of whether
  // it currently looks like it needs it -- for cases the automatic filler-
  // text/cite-tag detector can't catch, like facts that came back
  // well-formed but about the wrong real-world place entirely (a name
  // collision the AI got wrong). Bypasses needsFactsBackfill and MAX_PER_RUN.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const forceDocId = typeof body.landmarkId === 'string' ? body.landmarkId.trim().slice(0, 200) : '';

  try {
    let docs;
    if (forceDocId) {
      const docRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/custom_landmarks/${encodeURIComponent(forceDocId)}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!docRes.ok) {
        res.status(docRes.status === 404 ? 404 : 502).json({ error: 'Could not find that landmark.' });
        return;
      }
      docs = [await docRes.json()];
    } else {
      const listRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/custom_landmarks?pageSize=300`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!listRes.ok) {
        res.status(502).json({ error: 'Could not list submitted landmarks.' });
        return;
      }
      const listData = await listRes.json();
      docs = listData.documents || [];
    }

    const candidates = forceDocId
      ? docs
      : docs.filter((doc) => needsFactsBackfill(decodeFields(doc.fields))).slice(0, MAX_PER_RUN);

    let updated = 0;
    const updatedNames = [];
    const errors = [];

    for (const doc of candidates) {
      const data = decodeFields(doc.fields);
      const userFacts = Array.isArray(data.facts) ? data.facts : [];
      const categories = Array.isArray(data.categories) ? data.categories : [];
      const hasPhoto = Array.isArray(data.images) && data.images.length > 0;
      try {
        const placeContext = await reverseGeocode(data.lat, data.lng);
        const enriched = await enrichLandmark({
          name: data.name,
          lat: data.lat,
          lng: data.lng,
          userFacts,
          placeContext,
          categories,
          hasPhoto,
        });

        // Category and photo are real submitter choices -- only fill them
        // in when genuinely empty, never overwrite one that's already set.
        // typicalMinutes is never actually submitter-chosen (Add Landmark
        // has no UI for it; every doc just carries the hardcoded 15
        // default), so a better AI estimate always replaces it.
        const fields = {
          summary: encodeValue(enriched.summary),
          facts: encodeValue(enriched.facts),
          free: encodeValue(enriched.free),
        };
        const maskFields = ['summary', 'facts', 'free'];
        if (categories.length === 0 && enriched.category) {
          fields.categories = encodeValue([enriched.category]);
          maskFields.push('categories');
        }
        if (!hasPhoto && enriched.imageUrl) {
          fields.images = encodeValue([enriched.imageUrl]);
          maskFields.push('images');
        }
        if (enriched.typicalMinutes) {
          fields.typicalMinutes = encodeValue(enriched.typicalMinutes);
          maskFields.push('typicalMinutes');
        }

        const patchRes = await fetch(
          `https://firestore.googleapis.com/v1/${doc.name}?${maskFields.map((f) => `updateMask.fieldPaths=${f}`).join('&')}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
          }
        );
        if (!patchRes.ok) throw new Error(`Firestore write failed (${patchRes.status})`);
        updated++;
        updatedNames.push(data.name);
      } catch (e) {
        errors.push({ name: data.name, error: e.message || 'unknown error' });
      }
    }

    const totalCandidates = forceDocId ? candidates.length : docs.filter((doc) => needsFactsBackfill(decodeFields(doc.fields))).length;
    res.status(200).json({
      total: totalCandidates,
      updated,
      updatedNames,
      remaining: Math.max(0, totalCandidates - updated),
      errors,
    });
  } catch {
    res.status(500).json({ error: 'Backfill failed. Try again.' });
  }
}
