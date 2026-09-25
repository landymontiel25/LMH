// Quick-pick examples for the "tell Mapr what you like" nudge -- shown
// instantly (no AI round trip, just this list) so tapping a few chips is as
// fast as typing a sentence. Curated, not exhaustive: just enough per
// category to give someone something concrete to react to ("oh yeah, steak,
// not sushi") instead of staring at a blank box. Chosen picks get folded
// into the same free-text tasteIntro a typed/spoken answer would produce
// (see TasteNudgeCard.jsx), so they're read by the AI as prose either way.
export const TASTE_QUESTIONS = [
  {
    id: 'food',
    label: 'Food',
    icon: '\u{1F37D}\u{FE0F}',
    prompt: 'Steak or pizza?',
    examples: ['Steak', 'Pizza', 'Sushi', 'Fine dining', 'Street food', 'Coffee shops'],
  },
  {
    id: 'history-culture',
    label: 'History & Culture',
    icon: '\u{1F3DB}\u{FE0F}',
    prompt: 'Museums or old architecture?',
    examples: ['Museums', 'Historic architecture', 'Old churches', 'Battlefields'],
  },
  {
    id: 'parks-nature',
    label: 'Parks & Nature',
    icon: '\u{1F333}',
    prompt: 'Hiking or the beach?',
    examples: ['Hiking trails', 'Scenic views', 'Beaches', 'Gardens'],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: '\u{1F39F}\u{FE0F}',
    prompt: 'Live music or a show?',
    examples: ['Live music', 'Comedy shows', 'Theme parks', 'Aquariums'],
  },
  {
    id: 'sports',
    label: 'Sports & Activities',
    icon: '\u{1F3C0}',
    prompt: 'Golf or pickleball?',
    examples: ['Golf', 'Pickleball', 'Racing', 'Stadium games', 'Boating'],
  },
  {
    id: 'local-life',
    label: 'Local Life',
    icon: '\u{1F378}',
    prompt: 'Nightlife or a dive bar?',
    examples: ['Nightlife / clubs', 'Dive bars', 'Farmers markets', 'Luxury / fancy spots'],
  },
];
