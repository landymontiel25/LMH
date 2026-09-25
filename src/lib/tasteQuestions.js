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
