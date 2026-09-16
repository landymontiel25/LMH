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
  `Pick the 4 catalog landmarks this traveler is most likely to love next, most confident first.\n\n` +
  `Rules:\n` +
  `- Weigh what they wrote in their own words most, then their loved places' categories and chips, then saved interests.\n` +
  `- Prefer variety across the 4 picks unless the history is clearly single-minded.\n` +
  `- matchPercentage is your honest confidence, 60-99. Don't give everything 97.\n` +
  `- oneLineSummary: under 12 words, concrete, about the place itself (not "you'll love it").\n` +
  `- Only use region/id values that appear in the catalog. Never invent one.\n\n` +
  `Reply with ONLY this JSON, no other text:\n` +
  `{"picks": [{"match": "<region/id>", "matchPercentage": <60-99>, "oneLineSummary": "<text>"}, ...]}`;

const str = (v, n) => String(v ?? '').trim().slice(0, n);

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

    // Pool: places they haven't visited, in cities they've been to (or are
    // planning) when we know any -- a pick in a city they'll never be in
    // isn't much of a pick. No rateable-category filter: a dorm never
    // makes a good pick, so drop the unrateable ones here.
    const UNRATEABLE = new Set(['dorms', 'campus-life']);
    let pool = ALL_LANDMARKS.filter((l) => !checkedIn.has(l.id) && !UNRATEABLE.has(l.categories?.[0]));
    if (regionIds.size) {
      const inCities = pool.filter((l) => regionIds.has(l.regionId));
      if (inCities.length >= 8) pool = inCities;
    }
    const validIds = new Map(pool.map((l) => [`${l.regionId}/${l.id}`, l]));

    const history =
      (reviews.length
        ? 'RATING HISTORY:\n' +
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
      '\n\nCATALOG (region/id | name | category | description):\n' +
      pool.map((l) => `${l.regionId}/${l.id} | ${l.name} | ${l.categories?.[0] || ''} | ${(l.summary || '').slice(0, 120)}`).join('\n');

    const client = new Anthropic();
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 800,
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
          matchPercentage: Number.isFinite(pct) ? Math.min(99, Math.max(60, pct)) : 80,
          oneLineSummary: str(p?.oneLineSummary, 90) || (landmark.summary || '').split(/[.!?]/)[0].slice(0, 90),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 4);

    res.status(200).json({ picks });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'Mapr is busy right now — try again in a moment.' : 'Mapr request failed. Please try again.',
    });
  }
}
