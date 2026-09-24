import Anthropic from '@anthropic-ai/sdk';

// Shared by /api/verify-landmark (new submissions) and
// /api/backfill-landmark-facts (existing submissions that predate this
// feature) -- one place for the AI research call so both stay in sync.

export const ENRICHMENT_INSTRUCTIONS =
  `You help fill in details for a new landmark submitted to "Landmark Hunters", an app where people visit real places ` +
  `and check in. A user gave a name and an approximate location for a real physical place (the name may actually be an ` +
  `address, since that's what the location box auto-fills with when left blank). Use web search to find out what this ` +
  `specific place actually is, and write REAL, SPECIFIC facts about it from what you find -- never invent a fact you ` +
  `can't source. Search using the name and location together.\n\n` +
  `If the submitter already gave their own facts, trust them (they're on the ground, you're not) -- keep those exactly ` +
  `as given (only clean up grammar), and add your own researched facts only to fill the list up to 5 total, never ` +
  `replacing or contradicting what they wrote. If they gave 5 or more already, don't add any.\n\n` +
  `Write a SHORT (1-2 sentence) honest summary of the place based on what your search actually finds. If search turns ` +
  `up nothing specific about this exact place (too small, too new, or just an address with no indexed business), say ` +
  `so plainly in the summary instead of guessing -- e.g. "A community-submitted spot; couldn't find more detail on it ` +
  `online yet." -- and lean on the submitter's own facts if they gave any.\n\n` +
  `Guess whether it's normally free to visit based on what you find (default to true unless search indicates a paid ` +
  `attraction or venue).\n\n` +
  `Reply with ONLY a JSON object, no other text:\n` +
  `{"summary": "<1-2 sentence summary>", "facts": ["<fact>", ...], "free": true|false}`;

// Best-effort reverse geocode for real-world grounding -- never throws.
export async function reverseGeocode(lat, lng) {
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
  return placeContext;
}

// Throws on any failure (bad response, unparseable JSON) -- callers decide
// what "couldn't enrich this one" should fall back to.
export async function enrichLandmark({ name, lat, lng, userFacts = [], placeContext = '' }) {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    system: ENRICHMENT_INSTRUCTIONS,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [
      {
        role: 'user',
        content:
          `Name: ${name}\n` +
          `Approximate location: ${placeContext || `${lat}, ${lng}`}\n` +
          (userFacts.length
            ? `Facts the submitter already gave (keep these, only add more to reach 5):\n${userFacts.map((f) => `- ${f}`).join('\n')}\n`
            : 'The submitter gave no facts of their own.'),
      },
    ],
  });

  const raw = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));

  return {
    summary: String(parsed.summary || '').slice(0, 300),
    facts: (Array.isArray(parsed.facts) && parsed.facts.length ? parsed.facts : userFacts)
      .map((f) => String(f).slice(0, 160))
      .slice(0, 5),
    free: parsed.free !== false,
  };
}
