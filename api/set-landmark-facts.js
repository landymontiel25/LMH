import { verifyIdToken } from './_lib/verifyAuth.js';
import { isRateLimited } from './_lib/rateLimit.js';
import { encodeValue } from './_lib/firestoreRest.js';
import { ADMIN_EMAILS } from '../src/lib/admins.js';

// Admin-only, no AI involved at all -- a direct manual correction for when
// the AI enrichment (verify-landmark.js / backfill-landmark-facts.js) got
// something wrong and re-running it isn't what's wanted. Same Firestore
// REST + caller's-own-ID-token pattern as the AI-backed endpoints (see
// backfill-landmark-facts.js for why there's no firebase-admin here).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
  if (isRateLimited(req, 'set-landmark-facts', { limit: 20, windowMs: 10 * 60 * 1000 })) {
    res.status(429).json({ error: 'Too many edits in a row — try again in a bit.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const landmarkId = String(body.landmarkId || '').trim().slice(0, 200);
    if (!landmarkId) {
      res.status(400).json({ error: 'Missing landmarkId.' });
      return;
    }

    const fields = {};
    const maskFields = [];

    if (body.summary !== undefined) {
      fields.summary = encodeValue(String(body.summary).slice(0, 300));
      maskFields.push('summary');
    }
    if (body.facts !== undefined) {
      const facts = Array.isArray(body.facts)
        ? body.facts.map((f) => String(f).trim().slice(0, 160)).filter(Boolean).slice(0, 5)
        : [];
      fields.facts = encodeValue(facts);
      maskFields.push('facts');
    }
    if (body.free !== undefined) {
      fields.free = encodeValue(body.free !== false);
      maskFields.push('free');
    }
    if (!maskFields.length) {
      res.status(400).json({ error: 'Nothing to update — give summary, facts, and/or free.' });
      return;
    }

    const patchRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/custom_landmarks/${encodeURIComponent(landmarkId)}?${maskFields.map((f) => `updateMask.fieldPaths=${f}`).join('&')}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }
    );
    if (!patchRes.ok) {
      res.status(patchRes.status === 404 ? 404 : 502).json({ error: 'Could not save — landmark not found or write rejected.' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not save. Try again.' });
  }
}
