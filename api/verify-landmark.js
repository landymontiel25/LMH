import Anthropic from '@anthropic-ai/sdk';

// Backs "Add Landmark" on the map: before a user-submitted spot gets saved as
// a real landmark, this asks the AI to sanity-check it's a genuine physical
// place worth adding -- not a joke, spam, or an unrelated photo -- and to
// write the short description/facts that make it feel like a real catalog
// entry instead of a bare pin.
//
// Important limitation: an LLM can't confirm a small local spot truly exists
// from a name + coordinates + one photo. This is a plausibility/moderation
// check (does the name, category, and photo look like a real submitted
// place?), not proof. The AI is explicitly told never to invent specific
// facts it can't know -- only a generic, honest description.
const INSTRUCTIONS =
  `You help moderate submissions to "Landmark Hunters", an app where people add real places for others to visit and check in at. ` +
  `A traveler submitted a name, one or more categories, an approximate location, and a photo. Decide if this looks like a genuine, ` +
  `specific physical place worth adding -- reject joke/test/gibberish names, offensive content, spam, or a photo that isn't of a real ` +
  `place (a screenshot, a meme, a document, a random object with no place context, a selfie with no visible location, etc).\n\n` +
  `If it passes, write a SHORT, HONEST description. You do not actually know this specific place, so NEVER invent specific facts ` +
  `(no made-up history, dates, architects, or events) -- describe only what's generically true of its category and what you can see ` +
  `in the photo, and be upfront that it's a community-submitted spot. 0-3 short "facts" are fine ONLY if they're safely generic ` +
  `(e.g. "A popular spot for [category] near [area]") -- never fabricated specifics. Guess whether it's normally free to visit ` +
  `(default to true unless the category or photo strongly implies a paid attraction).\n\n` +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"ok": true|false, "reason": "<if ok is false, one short sentence why>", "summary": "<1-2 sentence honest description>", "facts": ["<fact>", ...], "free": true|false}`;

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
    const name = String(body.name || '').trim().slice(0, 80);
    const categories = Array.isArray(body.categories) ? body.categories.map((c) => String(c).slice(0, 40)).slice(0, 6) : [];
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const imageDataUrl = String(body.imageDataUrl || '');
    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);

    if (!name || categories.length === 0 || !match || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Missing name, category, location, or photo.' });
      return;
    }
    const [, mediaType, imageB64] = match;

    // Best-effort reverse geocode for real-world grounding -- never blocks
    // the request if it fails or is slow.
    let placeContext = '';
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4000);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
        { headers: { Accept: 'application/json' }, signal: controller.signal }
      );
      clearTimeout(t);
      if (r.ok) {
        const data = await r.json();
        if (data?.display_name) placeContext = String(data.display_name).slice(0, 200);
      }
    } catch {
      // offline / rate-limited -- fine without it
    }

    const client = new Anthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Name: ${name}\n` +
                `Categories: ${categories.join(', ')}\n` +
                `Approximate location: ${placeContext || `${lat}, ${lng}`}\n` +
                `Here's the submitted photo:`,
            },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
          ],
        },
      ],
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
      // Can't parse the AI's answer -- fail closed rather than silently
      // publishing an unreviewed submission.
      res.status(200).json({ ok: false, reason: 'Could not verify this submission — try again.' });
      return;
    }

    res.status(200).json({
      ok: !!parsed.ok,
      reason: String(parsed.reason || '').slice(0, 200),
      summary: String(parsed.summary || '').slice(0, 300),
      facts: (Array.isArray(parsed.facts) ? parsed.facts : []).map((f) => String(f).slice(0, 160)).slice(0, 3),
      free: parsed.free !== false,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
