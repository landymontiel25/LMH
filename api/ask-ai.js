import Anthropic from '@anthropic-ai/sdk';

// Serverless AI concierge for a landmark. The Anthropic API key lives ONLY here
// (Vercel env var ANTHROPIC_API_KEY) — never in the client bundle.
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
    const landmark = String(body.landmark || 'this place').slice(0, 120);
    const city = body.city ? String(body.city).slice(0, 80) : '';
    const question = String(body.question || '').trim().slice(0, 500);

    if (!question) {
      res.status(400).json({ error: 'Please type a question.' });
      return;
    }

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const system =
      `You are a warm, knowledgeable local travel guide inside the app "Landmark Hunters". ` +
      `The traveler is asking about the landmark "${landmark}"${city ? ` in ${city}` : ''}. ` +
      `Answer in a friendly, practical way and keep it short (2–5 sentences unless they ask for more): ` +
      `history, what to see, tips, what to order, best time of day, nearby gems. ` +
      `If a detail can change (exact hours, prices, ticket availability), say it may vary and suggest checking official sources. ` +
      `Stay focused on this landmark and travel; if asked something unrelated, gently steer back.`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: question }],
    });

    const answer = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.status(200).json({ answer: answer || 'Sorry, I could not come up with an answer — try rephrasing.' });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
