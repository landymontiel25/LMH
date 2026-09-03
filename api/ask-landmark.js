import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS } from '../src/data/regions.js';

// Serverless "which landmark is this?" lookup. Lets a player ask something like
// "what's the james bond house called" from anywhere in the app, without the
// question needing to match a landmark's name or stored keywords. Grounded in
// the app's own landmark catalog so it can only point at real entries — never
// invents a place. Same ANTHROPIC_API_KEY as /api/ask-ai (Vercel env var only).
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
    const question = String(body.question || '').trim().slice(0, 300);
    if (!question) {
      res.status(400).json({ error: 'Please type a question.' });
      return;
    }

    const validIds = new Set(ALL_LANDMARKS.map((l) => `${l.regionId}/${l.id}`));
    const catalog = ALL_LANDMARKS.map(
      (l) => `${l.regionId}/${l.id} | ${l.name} | ${l.summary.slice(0, 140)}`
    ).join('\n');

    const system =
      `You are a lookup assistant inside the app "Landmark Hunters". Below is the app's full ` +
      `catalog of real landmarks, one per line as "region/id | name | short description". ` +
      `The traveler will ask a question trying to identify or recall ONE landmark from this catalog ` +
      `(e.g. a nickname, a movie/TV connection, a vague description). ` +
      `Find the single best-matching landmark and reply with ONLY a JSON object, no other text: ` +
      `{"match": "region/id", "answer": "1-2 sentence friendly answer naming the landmark and why it matches"} ` +
      `If nothing in the catalog clearly matches, reply {"match": null, "answer": "a short honest sentence saying so"}. ` +
      `Never invent a region/id that isn't in the catalog below.\n\n${catalog}`;

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: question }],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    let parsed;
    try {
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      parsed = JSON.parse(jsonText);
    } catch {
      res.status(200).json({ match: null, answer: raw || 'Sorry, I could not figure that out — try rephrasing.' });
      return;
    }

    const match = validIds.has(parsed.match) ? parsed.match : null;
    const [regionId, id] = match ? match.split('/') : [null, null];
    const landmark = match ? ALL_LANDMARKS.find((l) => l.regionId === regionId && l.id === id) : null;

    res.status(200).json({
      answer: String(parsed.answer || '').slice(0, 600) || 'Sorry, I could not figure that out — try rephrasing.',
      match: landmark ? { region: regionId, id, name: landmark.name } : null,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
