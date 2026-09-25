// Per-user daily ceiling on AI spend, durable across every serverless
// instance (the in-memory limiter in rateLimit.js only covers one warm
// instance, for minutes).
//
// Each AI call adds "units" to ai_usage/{uid}_{YYYY-MM-DD} through the
// Firestore REST API, authenticated as the calling user with their own ID
// token -- no service account needed. firestore.rules only lets that doc go
// UP, by at most 10 units per write, and never be deleted, so a user can't
// reset their own count by writing to it directly. The server increments
// first and then checks the new total, so there's no read-then-write race.
//
// Units are rough relative costs, not dollars:
//   ask-ai 1 (Haiku, cached catalog) · classify-interest 2 · verify-landmark 2
//   plan-ai 4 (Haiku + up to 5 web searches) · mapr-picks 4 (Opus)
// DAILY_UNIT_CAP of 120 is ~30 Mapr chat replies a day for one person.
export const DAILY_UNIT_CAP = 120;

/**
 * Adds `units` to today's counter for this account. Returns
 * { ok: true, total } when under the cap, { ok: false, total } when over,
 * or { ok: false, unavailable: true } when the counter itself can't be
 * written (e.g. the rules rejected it) -- callers treat that as a refusal
 * so a misconfiguration fails closed instead of uncapped.
 */
export async function addDailyUsage(account, units) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, unavailable: true };
  const day = new Date().toISOString().slice(0, 10);
  const base = `projects/${projectId}/databases/(default)/documents`;
  let r;
  try {
    r = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.idToken}` },
      body: JSON.stringify({
        writes: [
          {
            transform: {
              document: `${base}/ai_usage/${account.uid}_${day}`,
              fieldTransforms: [
                { fieldPath: 'units', increment: { integerValue: String(units) } },
                { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              ],
            },
          },
        ],
      }),
    });
  } catch {
    // Firestore itself unreachable: not something a caller can trigger, so
    // let the request through rather than take the AI down with it.
    return { ok: true, total: 0 };
  }
  if (r.status >= 500) return { ok: true, total: 0 };
  if (!r.ok) return { ok: false, unavailable: true };
  const data = await r.json().catch(() => null);
  const total = Number(data?.writeResults?.[0]?.transformResults?.[0]?.integerValue);
  if (!Number.isFinite(total)) return { ok: true, total: 0 };
  return { ok: total <= DAILY_UNIT_CAP, total };
}
