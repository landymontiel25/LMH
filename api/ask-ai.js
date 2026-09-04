import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS } from '../src/data/regions.js';

// ONE unified AI assistant for Landmark Hunters. It knows the whole catalog, so
// it can BOTH:
//   1) identify/find a landmark from a vague description (nickname, movie, etc.)
//      and hand back a link to it, and
//   2) answer any travel question about a landmark or city (history, tips, food,
//      best time to go, nearby gems).
// The Anthropic API key lives ONLY here (Vercel env var ANTHROPIC_API_KEY) —
// never in the client bundle. Same endpoint used by the global "✨" widget and
// the per-landmark "Ask AI" button.

const INSTRUCTIONS =
  `You are the friendly AI travel guide inside the app "Landmark Hunters". ` +
  `You have the app's full catalog of real landmarks (below, one per line as "region/id | name | short description"). ` +
  `You can do either of two things depending on what the traveler asks:\n` +
  `1) IDENTIFY / FIND a landmark — if they describe one vaguely (a nickname, a movie/TV connection, "the palace with the porcelain room", a rough location), find the single best match from the catalog and point them to it.\n` +
  `2) ANSWER anything about a landmark or city — history, what to see, tips, what to order, best time of day, nearby gems.\n\n` +
  `Keep answers warm and short (2–5 sentences unless they ask for more). If a detail can change (exact hours, prices, ticket availability), say it may vary and suggest checking official sources. ` +
  `If the traveler says they're currently viewing a specific landmark, prefer answering about that one — but you still know the whole catalog.\n\n` +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"answer": "<your helpful reply>", "match": "<region/id from the catalog, or null>"}\n` +
  `- Set "match" to a landmark's region/id when the traveler was trying to find/identify a specific place, or when your answer points them to one worth opening. Use null for general questions where no link is needed.\n` +
  `- NEVER invent a region/id that isn't in the catalog.`;

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
    const question = String(body.question || '').trim().slice(0, 500);
    if (!question) {
      res.status(400).json({ error: 'Please type a question.' });
      return;
    }
    // Optional context when asked from a specific landmark's page.
    const here = body.landmark ? String(body.landmark).slice(0, 120) : '';
    const hereCity = body.city ? String(body.city).slice(0, 80) : '';

    const validIds = new Set(ALL_LANDMARKS.map((l) => `${l.regionId}/${l.id}`));
    const catalog =
      'CATALOG (region/id | name | description):\n' +
      ALL_LANDMARKS.map((l) => `${l.regionId}/${l.id} | ${l.name} | ${(l.summary || '').slice(0, 140)}`).join('\n');

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const userText =
      (here ? `The traveler is currently viewing "${here}"${hereCity ? ` in ${hereCity}` : ''}.\n\n` : '') +
      `Question: ${question}`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      // Catalog is identical every request → cache it so repeat calls are cheap.
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
      // Model didn't return clean JSON — still give the traveler the text.
      res.status(200).json({ answer: raw || 'Sorry, I could not answer that — try rephrasing.', match: null });
      return;
    }

    const matchId = validIds.has(parsed.match) ? parsed.match : null;
    const [regionId, id] = matchId ? matchId.split('/') : [null, null];
    const landmark = matchId ? ALL_LANDMARKS.find((l) => l.regionId === regionId && l.id === id) : null;

    res.status(200).json({
      answer: String(parsed.answer || '').slice(0, 900) || 'Sorry, I could not answer that — try rephrasing.',
      match: landmark ? { region: regionId, id, name: landmark.name } : null,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
