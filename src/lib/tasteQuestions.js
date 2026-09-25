// Quick-pick examples for the "tell Mapr what you like" nudge -- shown
// instantly (no AI round trip, just this list) so tapping a few chips is as
// fast as typing a sentence. Curated, not exhaustive: just enough per
// category to give someone something concrete to react to ("oh yeah, steak,
// not sushi") instead of staring at a blank box. Each example is a
// tri-state chip in TasteNudgeCard (neutral -> like -> dislike -> neutral),
// not just a like list -- this is meant to be the BASELINE Mapr starts
// from (what you like AND what you don't), which individual landmark
// ratings then refine with more specific reasons ("no pepper on my steak")
// as they come in. Chosen picks get folded into the same free-text
// tasteIntro a typed/spoken answer would produce, so they're read by the
// AI as prose either way.
export const TASTE_QUESTIONS = [
  {
    id: 'food',
    label: 'Food',
    icon: '\u{1F37D}\u{FE0F}',
    prompt: 'Like or hate any of these?',
    examples: ['Steak', 'Pizza', 'Sushi', 'Fine dining', 'Street food', 'Coffee shops'],
  },
  {
    id: 'history-culture',
    label: 'History & Culture',
    icon: '\u{1F3DB}\u{FE0F}',
    prompt: 'Like or hate any of these?',
    examples: ['Museums', 'Historic architecture', 'Old churches', 'Battlefields'],
  },
  {
    id: 'parks-nature',
    label: 'Parks & Nature',
    icon: '\u{1F333}',
    prompt: 'Like or hate any of these?',
    examples: ['Hiking trails', 'Scenic views', 'Beaches', 'Gardens'],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: '\u{1F39F}\u{FE0F}',
    prompt: 'Like or hate any of these?',
    examples: ['Live music', 'Comedy shows', 'Theme parks', 'Aquariums', 'Crowds / long lines'],
  },
  {
    id: 'sports',
    label: 'Sports & Activities',
    icon: '\u{1F3C0}',
    prompt: 'Like or hate any of these?',
    examples: ['Golf', 'Pickleball', 'Racing', 'Stadium games', 'Boating'],
  },
  {
    id: 'local-life',
    label: 'Local Life',
    icon: '\u{1F378}',
    prompt: 'Like or hate any of these?',
    examples: ['Nightlife / clubs', 'Dive bars', 'Farmers markets', 'Luxury / fancy spots'],
  },
];

// `baseline` is { [categoryId]: { [example]: 'like' | 'dislike' } }, as
// TasteNudgeCard/TasteProfileCard's edit flow build it. Turned into plain
// prose ("Food: likes Steak, Fine dining; dislikes Sushi") so the AI reads
// it exactly like a typed answer -- see api/plan-ai.js and
// api/mapr-picks.js's IN THEIR OWN WORDS section.
export function baselineToSentence(baseline) {
  if (!baseline) return '';
  return TASTE_QUESTIONS.filter((q) => baseline[q.id] && Object.keys(baseline[q.id]).length)
    .map((q) => {
      const cat = baseline[q.id];
      const likes = Object.keys(cat).filter((k) => cat[k] === 'like');
      const dislikes = Object.keys(cat).filter((k) => cat[k] === 'dislike');
      const parts = [];
      if (likes.length) parts.push(`likes ${likes.join(', ')}`);
      if (dislikes.length) parts.push(`dislikes ${dislikes.join(', ')}`);
      return `${q.label}: ${parts.join('; ')}`;
    })
    .join('. ');
}

// Turns the same structured baseline into synthetic review-shaped objects
// (tier/categories/name), so it can feed the leave-one-out prediction
// confidence in tasteProfile.js exactly like a real rating would -- a
// baseline "like" behaves like a highly-recommend, a "dislike" like a
// probably-skip, at the category level. This is how filling in the taste
// baseline actually moves the Taste Profile Score, not just a side effect
// of the free-text prompt reaching the AI.
export function baselineToSyntheticReviews(baseline) {
  if (!baseline) return [];
  const out = [];
  for (const q of TASTE_QUESTIONS) {
    const cat = baseline[q.id];
    if (!cat) continue;
    for (const [example, state] of Object.entries(cat)) {
      out.push({
        tier: state === 'like' ? 'highly-recommend' : 'probably-skip',
        categories: [q.id],
        name: example,
        comment: '',
        highlights: [],
      });
    }
  }
  return out;
}

// The full text sent to the AI as this traveler's taste profile -- free-form
// tasteIntro (onboarding/Settings), the structured baseline as prose, and
// any notes typed alongside it in the edit/nudge card, combined at read
// time so editing the baseline later never means hunting through
// previously-saved sentences to avoid duplicating them.
export function composeTasteIntro(myProfile) {
  return [myProfile?.tasteIntro, baselineToSentence(myProfile?.tasteBaseline), myProfile?.tasteBaselineNotes]
    .filter(Boolean)
    .join('. ');
}
