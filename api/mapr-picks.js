import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS } from '../src/data/regions.js';
import { isRateLimited } from './_lib/rateLimit.js';

// "Your Mapr Picks" on Profile: 4 catalog landmarks the traveler hasn't
// checked into yet, ranked by how well they fit what that traveler has
// rated so far (loved / skipped places, the chips they tap, their own
// comments, their saved interests). One call per profile load, cached on
// the client for a day, so this stays cheap despite the bigger model.
const INSTRUCTIONS =
  `You are Mapr, the taste engine inside the app "Landmark Hunters". You get a traveler's rating history ` +
  `(places they loved or would skip, the short reasons they tapped, anything they wrote) and a catalog of real ` +
  `landmarks they have NOT visited yet, one per line as "region/id | name | category | short description". ` +
  `Pick the 8 catalog landmarks this traveler is most likely to love next, most confident first (the app shows 4 and keeps the rest in reserve).\n\n` +
  `Rules:\n` +
  `- Every catalog line ends with how far it is from the traveler right now. These are all nearby; among good fits, prefer the closer one, and never pick something far when a similar closer option exists.\n` +
  `- Weigh what they wrote in their own words most, then their loved places' categories and chips, then saved interests.\n` +
  `- Just as important: weigh what they DISLIKED. A "probably skip" rating, or repeated ✗ feedback, on a category means avoid recommending more of that same category, even if it's the only thing nearby -- distance and popularity never outweigh a category the traveler has already told you they don't want. If most of what's nearby is a category they've skipped or rated poorly, it's fine to return fewer than 8 picks rather than filling the list with more of what they don't want.\n` +
  `- Go past the broad category label to the SPECIFIC kind of place, using each place's own description. A broad category can hide very different experiences: a zoo and a hiking trail both file under parks/nature; a cemetery, a private cricket club, and a historic mansion all file under history/culture or sports right alongside a beloved public museum or stadium. If the traveler rated or clearly said they'd skip a specific kind of place -- a zoo, a cemetery, an amusement park, a private/members-only club, a house of worship, whatever it specifically is -- don't recommend another one of that same specific kind even when the broad category is otherwise something they like, and even when a place they DID love (a public ballpark, say) happens to share that same broad category. One clear "probably skip" on that specific kind is enough on its own; don't wait for a pattern to repeat before acting on it.\n` +
  `- Recent signal matters more than old signal. If their most recent few ratings or votes point a different direction than their older history, trust the recent ones -- taste can change, and this app should notice fast, not average everything together as if it were said at once.\n` +
  `- PICK FEEDBACK (✓ "I'd go" / ✗ "not for me" on earlier picks) is a light signal about general taste -- lighter than a rating, and context-dependent: someone may ✗ a cathedral at night in Miami and still love cathedrals in Italy, or ✓ Yankee Stadium in New York but never a ballpark in Colorado. Use it to nudge category preferences, not to rule categories out entirely on its own -- but several ✗'s on the same category, or even a single ✗ that clearly names a specific kind of place (see above), is a real signal, not noise.\n` +
  `- Prefer variety across the 8 picks unless the history is clearly single-minded.\n` +
  `- matchPercentage is your honest confidence this SPECIFIC traveler will love this SPECIFIC place, 60-99 -- never inflate it just because a pick is the best of a mediocre nearby pool. If nothing nearby is a strong match for their taste, say so with a modest score (60s) rather than dressing up a weak fit as 90+, and it's fine to return fewer than 8 picks. Don't give everything 97.\n` +
  `- oneLineSummary: under 12 words, concrete, about the place itself (not "you'll love it").\n` +
  `- Only use region/id values that appear in the catalog. Never invent one.\n\n` +
  `Reply with ONLY this JSON, no other text:\n` +
  `{"picks": [{"match": "<region/id>", "matchPercentage": <60-99>, "oneLineSummary": "<text>"}, ...]}`;

const str = (v, n) => String(v ?? '').trim().slice(0, n);

// Haversine, inlined: src/lib/geo.js uses Vite-style extensionless imports
// that plain Node (where Vercel runs this) can't resolve.
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  if (isRateLimited(req, 'mapr-picks', { limit: 12, windowMs: 10 * 60 * 1000 })) {
    res.status(429).json({ error: 'Too many requests in a row — take a short break and try again.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const reviews = (Array.isArray(body.reviews) ? body.reviews : []).slice(0, 60).map((r) => ({
      name: str(r.name, 80),
      tier: str(r.tier, 30),
      categories: (Array.isArray(r.categories) ? r.categories : []).map((c) => str(c, 30)).slice(0, 3),
      highlights: (Array.isArray(r.highlights) ? r.highlights : []).map((h) => str(h, 40)).slice(0, 3),
      comment: str(r.comment, 280),
    }));
    const interests = (Array.isArray(body.interests) ? body.interests : []).map((c) => str(c, 30)).slice(0, 20);
    const checkedIn = new Set((Array.isArray(body.checkedInIds) ? body.checkedInIds : []).map((id) => str(id, 80)));
    const regionIds = new Set((Array.isArray(body.regionIds) ? body.regionIds : []).map((id) => str(id, 40)));
    const feedback = (Array.isArray(body.feedback) ? body.feedback : []).slice(0, 80).map((f) => ({
      name: str(f.name, 80),
      region: str(f.region, 40),
      categories: (Array.isArray(f.categories) ? f.categories : []).map((c) => str(c, 30)).slice(0, 3),
      verdict: f.verdict === 'yes' ? 'yes' : 'no',
    }));
    const passedIds = new Set((Array.isArray(body.passedIds) ? body.passedIds : []).map((id) => str(id, 80)));
    const origin =
      body.origin && Number.isFinite(Number(body.origin.lat)) && Number.isFinite(Number(body.origin.lng))
        ? { lat: Number(body.origin.lat), lng: Number(body.origin.lng) }
        : null;

    // Pool: places they haven't visited, near where they are right now --
    // everything within NEARBY_KM of their GPS fix, closest first, capped.
    // In Philadelphia that's Philly + the Main Line + Villanova; on Lake
    // Como it's Como, Milan and Monza. Without a fix, fall back to the
    // cities they've been to (or are planning). A dorm never makes a good
    // pick, so the unrateable categories are dropped here.
    const NEARBY_KM = 150;
    const POOL_CAP = 120;
    const UNRATEABLE = new Set(['dorms', 'campus-life']);
    let pool = ALL_LANDMARKS.filter(
      (l) => !checkedIn.has(l.id) && !passedIds.has(l.id) && !UNRATEABLE.has(l.categories?.[0])
    );
    if (origin) {
      pool = pool
        .map((l) => ({ ...l, km: distanceKm(origin.lat, origin.lng, l.lat, l.lng) }))
        .sort((a, b) => a.km - b.km);
      const near = pool.filter((l) => l.km <= NEARBY_KM);
      pool = (near.length >= 4 ? near : pool).slice(0, POOL_CAP);
    } else if (regionIds.size) {
      const inCities = pool.filter((l) => regionIds.has(l.regionId));
      if (inCities.length >= 8) pool = inCities;
    }
    const validIds = new Map(pool.map((l) => [`${l.regionId}/${l.id}`, l]));

    const history =
      (reviews.length
        ? 'RATING HISTORY (oldest first, most recent last -- weigh the end of this list more heavily):\n' +
          reviews
            .map(
              (r) =>
                `- ${r.name} [${r.categories.join(', ') || '?'}]: ${r.tier || 'rated'}` +
                (r.highlights.length ? ` — ${r.highlights.join(', ')}` : '') +
                (r.comment ? ` — "${r.comment}"` : '')
            )
            .join('\n')
        : 'RATING HISTORY: none yet.') +
      (interests.length ? `\n\nSAVED INTERESTS: ${interests.join(', ')}` : '') +
      (feedback.length
        ? '\n\nPICK FEEDBACK:\n' +
          feedback
            .map((f) => `- ${f.verdict === 'yes' ? '✓ would go' : '✗ not for me'}: ${f.name} [${f.categories.join(', ') || '?'}]${f.region ? ` (${f.region})` : ''}`)
            .join('\n')
        : '') +
      (origin ? '\n\nThe traveler is here right now; every catalog place is nearby.' : '') +
      '\n\nCATALOG (region/id | name | category | description | distance):\n' +
      pool
        .map(
          (l) =>
            `${l.regionId}/${l.id} | ${l.name} | ${l.categories?.[0] || ''} | ${(l.summary || '').slice(0, 120)}` +
            (l.km != null ? ` | ${l.km < 10 ? l.km.toFixed(1) : Math.round(l.km)} km away` : '')
        )
        .join('\n');

    const client = new Anthropic();
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1400,
      // Ranking a short list is routine work; low effort keeps it quick.
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
      system: [{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: history }],
    });

    if (msg.stop_reason === 'refusal') {
      res.status(200).json({ picks: [] });
      return;
    }
    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      res.status(200).json({ picks: [] });
      return;
    }

    const seen = new Set();
    const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
      .map((p) => {
        const landmark = validIds.get(str(p?.match, 120));
        if (!landmark || seen.has(landmark.id)) return null;
        seen.add(landmark.id);
        const pct = Math.round(Number(p?.matchPercentage));
        return {
          id: landmark.id,
          region: landmark.regionId,
          name: landmark.name,
          image: landmark.images?.[0] || null,
          categories: landmark.categories || [],
          matchPercentage: Number.isFinite(pct) ? Math.min(99, Math.max(60, pct)) : 80,
          oneLineSummary: str(p?.oneLineSummary, 90) || (landmark.summary || '').split(/[.!?]/)[0].slice(0, 90),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 8);

    res.status(200).json({ picks });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'Mapr is busy right now — try again in a moment.' : 'Mapr request failed. Please try again.',
    });
  }
}
