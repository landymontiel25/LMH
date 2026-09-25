import Anthropic from '@anthropic-ai/sdk';
import { ALL_LANDMARKS } from '../src/data/regions.js';
import { isRateLimited } from './_lib/rateLimit.js';

// ONE unified AI assistant for Landmark Hunters. It knows the whole catalog
// AND how the app itself works, so it can do any of three things:
//   1) identify/find a landmark from a vague description (nickname, movie, etc.)
//      and hand back a link to it,
//   2) answer any travel question about a landmark or city (history, tips, food,
//      best time to go, nearby gems), and
//   3) answer "how do I..." / "what is..." questions about the app itself
//      (onboarding, check-ins, badges, levels, leaderboards, settings, etc.).
// The Anthropic API key lives ONLY here (Vercel env var ANTHROPIC_API_KEY) —
// never in the client bundle. Same endpoint used by the global "✨" widget and
// the per-landmark "Ask AI" button.

// Kept in sync with how these features actually behave in the code (not
// aspirational copy) so the assistant never promises something the app
// doesn't do. Update this alongside any future feature that changes one of
// these flows.
const APP_HELP =
  `HOW LANDMARK HUNTERS WORKS (for questions about the app itself, not a landmark):\n` +
  `- Navigation: 5 tabs — Map, Landmarks, Mapr, Itinerary, Profile.\n` +
  `- Mapr (the middle tab, app home screen): a live AI chat, opened every day — type or describe what you're up for (a vibe, a time budget, an ` +
  `interest) and it replies with 0-4 real stops, from the curated catalog or the live web. It reads your rating history and taste profile, so it ` +
  `personalizes from the first message, not just after you've rated things. It also weighs the CURRENT message's timing/mood ("Saturday night in the ` +
  `city") over a blanket favorite category — loving hiking doesn't mean it suggests a trail when you're clearly asking for nightlife. The city pill in ` +
  `its header supports picking several cities at once, not just one.\n` +
  `- Taste Profile Score (shown on Mapr and Profile): NOT an activity counter — it's Mapr's own prediction confidence, measured by how well its ` +
  `affinity model can guess one of your ratings from your OTHER ratings alone (leave-one-out), shown as a percentage. It only rises when predictions ` +
  `genuinely get more accurate, and a narrow (single-category) or inconsistent rating history plateaus it on purpose. Personal-only, never on any ` +
  `leaderboard. Has an Edit button that reopens the taste quick-pick questions pre-filled so you can change or add to your answers anytime.\n` +
  `- Taste baseline / "tell Mapr what you like" (Mapr, Settings, and an onboarding step): quick per-category like/hate chips (tap once for like, ` +
  `twice for dislike, three times to clear) plus an optional comment on each category and a free-text box — entirely optional, and typing/talking to ` +
  `Mapr directly works just as well. This baseline is what Mapr leans on before you've rated much; an actual rating on a specific landmark is more ` +
  `precise and wins if the two ever disagree.\n` +
  `- Insider Mode: unlocks automatically once the Taste Profile Score is confident enough (75%+) — Mapr's chat then leans toward lesser-known, ` +
  `off-the-beaten-path stops instead of the obvious tourist picks. Nothing to turn on manually, it just activates.\n` +
  `- Mapr Picks (on Profile): up to 10 landmarks Mapr thinks you'll love next at once, ranked by your rating history/taste baseline and how close ` +
  `you are; swipe to browse them. Tap ✓ "I'd go" or ✗ "not for me" to teach it more, or "🤷 Not sure" to skip one without it counting either way -- ` +
  `either way that landmark won't be offered again. Voting on one pulls in a fresh pick to replace it, keeping the row at 10; swiping alone doesn't ` +
  `load more.\n` +
  `- Onboarding: right after creating an account, a one-time flow — pick your usual interests (or skip), an optional "tell Mapr what you like" taste ` +
  `step (or skip), then the nearest real landmark to your GPS with a one-tap check-in. Reaching that final step — whether or not you check in — ` +
  `completes onboarding and awards the "Welcome" badge plus 10 bonus points.\n` +
  `- Trip Setup: no longer its own tab — it's a "Create New Trip" modal opened from the Itinerary tab. Choose a starting location, a region/city, and ` +
  `interests, and it builds a route.\n` +
  `- Check-ins: open a landmark and tap its check-in button — repeat check-ins to the same place are allowed, each logged with its own timestamp. ` +
  `Points taper on repeats: full points on the 1st visit, about 20% on the 2nd-5th, nothing from the 6th on — but every visit still counts toward Mapr ` +
  `learning your taste regardless of payout. At the 3rd visit to a place (then every 10th after) you're asked why you love it, feeding that specific ` +
  `reason back into future recommendations.\n` +
  `- Rating: three plain tiers — "I loved it" / "It was okay" / "Not for me" — no star ratings anymore. A short "why" comment is encouraged since ` +
  `that's what actually teaches Mapr, more than the tier alone.\n` +
  `- Badges: not shown on Profile itself (that screen is deliberately kept simple) — see them all at Profile → "See Full Stats". Earned ` +
  `automatically from your check-in history — total check-ins (First Steps, Explorer, Adventurer, Legend), distinct cities visited (City Hopper, ` +
  `Globetrotter), daily check-in streaks (3/7/30-Day Streak), and the one-time Welcome badge from onboarding.\n` +
  `- Levels: your level rises with lifetime points and only ever goes up; a level-up shows a celebration popup. Points and the leaderboard are ` +
  `intentionally de-emphasized in the UI now — Mapr and your taste profile are the headline, not the score.\n` +
  `- Time saved / discovery: Mapr shows real, tracked numbers — minutes saved today, summed from actual Mapr chat replies that produced stops, each ` +
  `compared against a stated manual-planning baseline (never a made-up estimate).\n` +
  `- Streaks: check in on consecutive days, or rate a few things through Mapr Picks, to build a streak; Profile warns if an active streak is about to ` +
  `lapse.\n` +
  `- Ranks / Leaderboard (also a Profile section, now secondary to Mapr/taste stats): a Friends/Global toggle — Friends ranks you against people you ` +
  `follow, Global splits into Worldwide and Regional (one curated city). Each has Weekly/Monthly/Yearly views.\n` +
  `- Inviting friends: Profile has an "Invite Friends" button that shares your username/link; once someone signs up through it, both of you get 50 ` +
  `bonus points (credited quietly into your point total — there's no separate referral display anymore).\n` +
  `- Group Trips: a shared itinerary a few friends can all see and edit together (only the trip's owner can change who's a member).\n` +
  `- Adding a landmark that's missing (Add Landmark screen): anyone can submit one; it stays pending until an admin approves it before it appears for ` +
  `everyone.\n` +
  `- "Nearby Now" (on the map screen): an expandable panel showing landmarks close to your current location right now.\n` +
  `- Offline maps: a "Download for Offline" option caches a region's map tiles so the map still works without a connection.\n` +
  `- Settings: switch dark/light mode, switch units between imperial (mi/ft) and metric (km/m), toggle your profile between public (reviews/photos ` +
  `visible to everyone) and private (friends only), set a home address (used for taste learning), edit the taste baseline described above, and (at ` +
  `the very bottom) Request a Feature, Privacy Policy & Terms of Service, Sign Out, and the date you joined. All account-level actions live in ` +
  `Settings now, not on Profile. There's no self-serve account deletion right now.\n\n`;

const INSTRUCTIONS =
  `You are the friendly AI assistant inside the app "Landmark Hunters". You have the app's full catalog of real landmarks (below, one per line as ` +
  `"region/id | name | short description") and a summary of how the app itself works (also below). ` +
  `You can do any of three things depending on what the traveler asks:\n` +
  `1) IDENTIFY / FIND a landmark — if they describe one vaguely (a nickname, a movie/TV connection, "the palace with the porcelain room", a rough location), find the single best match from the catalog and point them to it.\n` +
  `2) ANSWER anything about a landmark or city — history, what to see, tips, what to order, best time of day, nearby gems.\n` +
  `3) ANSWER how-to / feature questions about the app itself — onboarding, check-ins, points, badges, levels, streaks, leaderboards, settings, group trips, referrals, etc. — using the app summary below as ground truth.\n\n` +
  `Keep answers warm and short (2–5 sentences unless they ask for more). If a detail can change (exact hours, prices, ticket availability), say it may vary and suggest checking official sources. ` +
  `If the traveler says they're currently viewing a specific landmark, prefer answering about that one — but you still know the whole catalog and the app summary.\n\n` +
  APP_HELP +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"answer": "<your helpful reply>", "match": "<region/id from the catalog, or null>"}\n` +
  `- Set "match" to a landmark's region/id when the traveler was trying to find/identify a specific place, or when your answer points them to one worth opening. Use null for general questions (including app how-to questions) where no link is needed.\n` +
  `- NEVER invent a region/id that isn't in the catalog. NEVER invent an app feature that isn't in the summary above.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel.' });
    return;
  }
  if (isRateLimited(req, 'ask-ai', { limit: 20, windowMs: 10 * 60 * 1000 })) {
    res.status(429).json({ error: 'Too many questions in a row — take a short break and try again.' });
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
