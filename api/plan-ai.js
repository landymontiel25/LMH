import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS, getRegion } from '../src/data/regions.js';
import { isRateLimited } from './_lib/rateLimit.js';

// Backs the Mapr tab's chat interface -- the app's home screen, the one
// thing people open every day -- a real back-and-forth instead of a
// one-shot form. The client sends the whole conversation so far (its own
// typed turns, plus each of the AI's previous replies), plus the same
// rating history and saved interests Mapr Picks reads, and gets one more
// assistant turn back: a short conversational reply, plus 0-4 real stops.
// Stops can come from our own curated catalog (open inside the app, full
// details, check-ins) OR, via the web_search tool below, from anywhere on the
// live web -- a city we don't track, a niche vibe (nightlife, racing, live
// music) our catalog doesn't model, or anything current -- so a request is
// never limited to just the landmarks we happen to have data for.
const INSTRUCTIONS =
  `You are the AI trip-planning chat inside the app "Landmark Hunters" -- the app's home screen, the first thing a ` +
  `traveler opens. You talk like a sharp, upbeat concierge -- short, natural sentences, no corporate fluff. You have ` +
  `a curated catalog of real landmarks (below, one per line as "region/id | name | short description"), a live ` +
  `web_search tool for anything the catalog doesn't cover, and -- when the traveler has rated or checked into ` +
  `anything before -- their own rating history and saved interests. A traveler is chatting with you about what they ` +
  `want to do. Reply to their latest message given the conversation so far.\n\n` +
  `Rules:\n` +
  `- If a TRAVELER PROFILE is given below, you actually know this person -- use it to personalize suggestions ` +
  `(same trait/category reasoning as Mapr Picks: weigh what they said in their own words and the reasons behind a ` +
  `rating over the bare category, and never suggest a specific kind of place -- a zoo, a cemetery, a private club, ` +
  `whatever it is -- they've clearly told you they skip). If they ask what you know about them or their interests, ` +
  `answer directly and specifically from the profile -- name actual places and reasons, don't hedge or deflect to ` +
  `a generic question when you genuinely have this data. If no profile is given (or it's empty), say plainly that ` +
  `you don't have a rating history for them yet rather than pretending otherwise, and ask what they're into.\n` +
  `- Prefer the catalog when it has a genuinely good fit -- those stops open inside the app with full details and check-ins.\n` +
  `- Use web_search whenever the catalog doesn't cover what they're asking -- a city or neighborhood we don't track, a specific vibe (nightlife, racing, shopping, live music), or anything current -- so you're never limited to just the catalog.\n` +
  `- If you already have enough to go on (a vibe, a time budget, an interest, or a rating history to lean on -- doesn't need to be much), recommend 2-4 real stops in a sensible order, mixing catalog and web-found places as needed, with one short reason each tied to what they said or to their known taste.\n` +
  `- If their ask is too vague to suggest anything useful yet AND you have no rating history to lean on either, ask ONE short clarifying question instead of guessing -- but don't stall forever; after any clarification, go ahead and suggest something. With a rating history, a vague ask ("something fun today") is enough to go on -- use their taste instead of asking them to repeat it.\n` +
  `- If they're just chatting (thanks, small talk, a question about a place you already suggested, or a question about their own taste/interests), reply naturally with no stops.\n` +
  `- When they push back or ask to adjust ("more nightlife", "skip the museum", "somewhere closer"), revise the picks accordingly.\n` +
  `- Never invent a place. Catalog stops must be real region/id values from the catalog below. Web-found stops must be real places you actually found via search, and must include the source URL.\n\n` +
  `Once you're done -- searching or not -- your ENTIRE visible reply must be ONLY a single JSON object. No narration before or after it, not even a note that you're searching:\n` +
  `{"reply": "<your conversational reply, 1-4 sentences>", "stops": [<catalog stop> | <web stop>, ...]}\n` +
  `- Catalog stop: {"match": "<region/id from the catalog>", "reason": "<why this stop, 1 short sentence>"}\n` +
  `- Web stop: {"name": "<real place name>", "place": "<city or neighborhood>", "url": "<source URL you found it from>", "reason": "<why this stop, 1 short sentence>"}\n` +
  `- "stops" can be an empty array. Only use region/id values that actually appear in the catalog -- for anything else, use the web stop shape instead of inventing a match id.`;

// claude-haiku-4-5 per-token pricing (USD per token, i.e. price-per-MTok / 1e6),
// plus $10/1,000 web searches -- used to report a running cost estimate to the
// client. Update these if the model or its pricing changes.
const PRICE_PER_TOKEN = {
  input: 1 / 1_000_000,
  output: 5 / 1_000_000,
  // cache_control below doesn't set a ttl, so writes default to the 5-minute tier.
  cacheWrite: 1.25 / 1_000_000,
  cacheRead: 0.1 / 1_000_000,
};
const PRICE_PER_SEARCH = 10 / 1000;
const str = (v, n) => String(v ?? '').trim().slice(0, n);

function estimateCostUsd(usage) {
  if (!usage) return 0;
  const tokenCost =
    (usage.input_tokens || 0) * PRICE_PER_TOKEN.input +
    (usage.output_tokens || 0) * PRICE_PER_TOKEN.output +
    (usage.cache_creation_input_tokens || 0) * PRICE_PER_TOKEN.cacheWrite +
    (usage.cache_read_input_tokens || 0) * PRICE_PER_TOKEN.cacheRead;
  const searchCost = (usage.server_tool_use?.web_search_requests || 0) * PRICE_PER_SEARCH;
  return tokenCost + searchCost;
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
  // Tighter than ask-ai's limit -- this endpoint's uncapped web_search tool
  // makes each call more expensive.
  if (isRateLimited(req, 'plan-ai', { limit: 10, windowMs: 10 * 60 * 1000 })) {
    res.status(429).json({ error: 'Too many planning requests in a row — take a short break and try again.' });
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

    // Same rating history Mapr Picks reads -- this is the app's home
    // screen now, so it should never have to say "I don't know you" when
    // the traveler has clearly already told the app what they like.
    const reviews = (Array.isArray(body.reviews) ? body.reviews : []).slice(0, 60).map((r) => ({
      name: str(r.name, 80),
      tier: str(r.tier, 30),
      categories: (Array.isArray(r.categories) ? r.categories : []).map((c) => str(c, 30)).slice(0, 3),
      highlights: (Array.isArray(r.highlights) ? r.highlights : []).map((h) => str(h, 40)).slice(0, 3),
      comment: str(r.comment, 280),
    }));
    const interests = (Array.isArray(body.interests) ? body.interests : []).map((c) => str(c, 30)).slice(0, 20);
    const profile = reviews.length
      ? 'TRAVELER PROFILE (their real rating history -- use it; see the rules on how):\n' +
        reviews
          .map(
            (r) =>
              `- ${r.name} [${r.categories.join(', ') || '?'}]: ${r.tier || 'rated'}` +
              (r.highlights.length ? ` — ${r.highlights.join(', ')}` : '') +
              (r.comment ? ` — "${r.comment}"` : '')
          )
          .join('\n') +
        (interests.length ? `\n\nSaved interests: ${interests.join(', ')}` : '')
      : interests.length
      ? `TRAVELER PROFILE: no ratings yet, but saved interests: ${interests.join(', ')}`
      : '';

    const client = new Anthropic();

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: catalog, cache_control: { type: 'ephemeral' } },
        ...(profile ? [{ type: 'text', text: profile }] : []),
      ],
      // Lets the AI look beyond our own catalog -- uncapped, so a request that
      // genuinely needs several searches isn't cut off. The client shows a
      // running cost total instead, so the trade-off stays visible.
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: turns,
    });

    const costUsd = estimateCostUsd(msg.usage);

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      res.status(200).json({ reply: raw || 'Lost my train of thought there -- try that again?', stops: [], cost: costUsd });
      return;
    }

    const stops = (Array.isArray(parsed.stops) ? parsed.stops : [])
      .slice(0, 8)
      .map((s) => {
        if (s?.match && validIds.has(s.match)) {
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
        }
        // A web-found stop instead of a catalog match -- needs a real name and
        // a source URL we can actually link back to; drop it otherwise rather
        // than show an unverifiable suggestion.
        const name = String(s?.name || '').trim().slice(0, 120);
        let url = String(s?.url || '').trim();
        if (!/^https?:\/\//i.test(url)) url = '';
        if (!name || !url) return null;
        return {
          external: true,
          name,
          place: String(s?.place || '').trim().slice(0, 80),
          url,
          reason: String(s?.reason || '').slice(0, 200),
        };
      })
      .filter(Boolean)
      .slice(0, 4);

    res.status(200).json({
      reply: String(parsed.reply || '').slice(0, 500) || "Here's what I found:",
      stops,
      cost: costUsd,
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'The AI is busy right now — try again in a moment.' : 'AI request failed. Please try again.',
    });
  }
}
