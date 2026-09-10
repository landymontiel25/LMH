import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS, getRegion } from '../src/data/regions.js';

// Test-tab prototype: instead of answering one question (api/ask-ai.js), this
// takes a free-text description of what someone wants to do and generates a
// short ordered plan (2-4 real stops from the catalog, never invented).
const INSTRUCTIONS =
  `You are the AI trip planner inside the app "Landmark Hunters". ` +
  `You have a catalog of real landmarks (below, one per line as "region/id | name | short description"). ` +
  `A traveler will give you a list of stated interests and/or free text describing what they're in the mood for -- time budget, vibe (e.g. "not touristy"). ` +
  `Pick 2-4 real stops from the catalog that best fit, in a sensible visiting order, and write one short reason per stop tied to what they asked for.\n\n` +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"intro": "<one warm sentence framing the plan>", "stops": [{"match": "<region/id from the catalog>", "reason": "<why this stop, 1 sentence>"}]}\n` +
  `- NEVER invent a region/id that isn't in the catalog.\n` +
  `- Pick fewer stops rather than pad the list if the catalog doesn't have good fits.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const request = String(body.request || '').trim().slice(0, 500);
    const interests = Array.isArray(body.interests)
      ? body.interests.map((i) => String(i).slice(0, 40)).filter(Boolean).slice(0, 8)
      : [];
    if (!request && interests.length === 0) {
      res.status(400).json({ error: 'Tell me what you want to do, or pick an interest.' });
      return;
    }
    const regionId = body.regionId ? String(body.regionId).slice(0, 40) : '';
    const region = regionId ? getRegion(regionId) : null;
    const pool = region ? ALL_LANDMARKS.filter((l) => l.regionId === regionId) : ALL_LANDMARKS;

    const validIds = new Set(pool.map((l) => `${l.regionId}/${l.id}`));
    const catalog =
      'CATALOG (region/id | name | description):\n' +
      pool.map((l) => `${l.regionId}/${l.id} | ${l.name} | ${(l.summary || '').slice(0, 140)}`).join('\n');

    const client = new Anthropic();

    const userText =
      (region ? `The traveler wants stops in ${region.name} only.\n\n` : '') +
      (interests.length ? `Stated interests: ${interests.join(', ')}\n\n` : '') +
      (request ? `Request: ${request}` : 'Request: (none — just go by the stated interests)');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: catalog, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userText }],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      res.status(200).json({ intro: raw || 'Could not put together a plan — try rephrasing.', stops: [] });
      return;
    }

    const stops = (Array.isArray(parsed.stops) ? parsed.stops : [])
      .filter((s) => validIds.has(s?.match))
      .slice(0, 4)
      .map((s) => {
        const [rid, id] = s.match.split('/');
        const landmark = pool.find((l) => l.regionId === rid && l.id === id);
        return { region: rid, id, name: landmark.name, image: landmark.images?.[0] || null, reason: String(s.reason || '').slice(0, 200) };
      });

    res.status(200).json({
      intro: String(parsed.intro || '').slice(0, 300),
      stops,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
