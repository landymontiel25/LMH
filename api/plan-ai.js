import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS, getRegion } from '../src/data/regions.js';

// Backs the "Test" tab's chat interface -- a real back-and-forth instead of a
// one-shot form. The client sends the whole conversation so far (its own
// typed turns, plus each of the AI's previous replies) and gets one more
// assistant turn back: a short conversational reply, plus 0-4 real stops
// from the catalog when it has enough to go on.
const INSTRUCTIONS =
  `You are the AI trip-planning chat inside the app "Landmark Hunters". You talk like a sharp, upbeat concierge -- ` +
  `short, natural sentences, no corporate fluff. You have a catalog of real landmarks (below, one per line as "region/id | name | short description"). ` +
  `A traveler is chatting with you about what they want to do. Reply to their latest message given the conversation so far.\n\n` +
  `Rules:\n` +
  `- If you already have enough to go on (a vibe, a time budget, an interest -- doesn't need to be much), recommend 2-4 real stops from the catalog in a sensible order, with one short reason each tied to what they said.\n` +
  `- If their ask is too vague to suggest anything useful yet, ask ONE short clarifying question instead of guessing -- but don't stall forever; after any clarification, go ahead and suggest something.\n` +
  `- If they're just chatting (thanks, small talk, a question about a place you already suggested), reply naturally with no stops.\n` +
  `- When they push back or ask to adjust ("more nightlife", "skip the museum", "somewhere closer"), revise the picks accordingly.\n` +
  `- Never invent a landmark that isn't in the catalog.\n\n` +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"reply": "<your conversational reply, 1-4 sentences>", "stops": [{"match": "<region/id from the catalog>", "reason": "<why this stop, 1 short sentence>"}]}\n` +
  `- "stops" can be an empty array. Only use region/id values that appear in the catalog.`;

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
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // Keep the payload (and cost) bounded -- a handful of recent turns is
    // plenty of context for a trip-planning chat.
    const turns = incoming
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }));

    if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
      res.status(400).json({ error: 'Say something to start planning.' });
      return;
    }

    const regionId = body.regionId ? String(body.regionId).slice(0, 40) : '';
    const region = regionId ? getRegion(regionId) : null;
    const pool = region ? ALL_LANDMARKS.filter((l) => l.regionId === regionId) : ALL_LANDMARKS;

    const validIds = new Set(pool.map((l) => `${l.regionId}/${l.id}`));
    const catalog =
      (region ? `The traveler wants stops in ${region.name} only.\n\n` : 'The traveler has not picked a city, so any city is fair game.\n\n') +
      'CATALOG (region/id | name | description):\n' +
      pool.map((l) => `${l.regionId}/${l.id} | ${l.name} | ${(l.summary || '').slice(0, 140)}`).join('\n');

    const client = new Anthropic();

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: catalog, cache_control: { type: 'ephemeral' } },
      ],
      messages: turns,
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
      res.status(200).json({ reply: raw || 'Lost my train of thought there -- try that again?', stops: [] });
      return;
    }

    const stops = (Array.isArray(parsed.stops) ? parsed.stops : [])
      .filter((s) => validIds.has(s?.match))
      .slice(0, 4)
      .map((s) => {
        const [rid, id] = s.match.split('/');
        const landmark = pool.find((l) => l.regionId === rid && l.id === id);
        return {
          region: rid,
          id,
          name: landmark.name,
          images: landmark.images || [],
          categories: landmark.categories,
          reason: String(s.reason || '').slice(0, 200),
        };
      });

    res.status(200).json({
      reply: String(parsed.reply || '').slice(0, 500) || "Here's what I found:",
      stops,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
