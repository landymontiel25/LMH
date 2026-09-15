import { INTERESTS } from '../data/regions';

// Only these categories get the rating flow. A landmark that's ONLY
// campus-life or dorms (a residence hall, an admissions office) skips
// straight to "checked in" -- rating a dorm on Price/Atmosphere tells
// Mapr nothing.
// Order matters: a landmark tagged with several of these takes its chip
// and aspect sets from the first match here. Airports go first (an airport
// is an airport whatever else it's tagged); parks and entertainment sit
// ahead of history so a "historic beach park" rates as a park.
export const RATEABLE_CATEGORIES = [
  'airports',
  'sports',
  'parks-nature',
  'entertainment',
  'history-culture',
  'art-museums',
  'food',
  'local-life',
];

export function isRateable(landmark) {
  return (landmark?.categories || []).some((c) => RATEABLE_CATEGORIES.includes(c));
}

export function ratingCategory(landmark) {
  return RATEABLE_CATEGORIES.find((c) => (landmark?.categories || []).includes(c)) || null;
}

// `stars` is derived from the tier, never picked directly: landmark_ratings'
// running avg (and the Top Rated sort, every card's star display) is built on
// a 1-5 scale, so keeping a numeric value flowing into that aggregate means
// nothing downstream had to change when the 5-star picker went away.
export const TIERS = [
  { id: 'highly-recommend', label: 'Highly recommend', emoji: '\u{2764}\u{FE0F}', stars: 5 },
  { id: 'worth-trying', label: 'Worth trying', emoji: '\u{1F610}', stars: 3 },
  { id: 'probably-skip', label: 'Probably skip', emoji: '\u{1F44E}', stars: 1 },
];

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || null;
}

export function tierStars(id) {
  return tierById(id)?.stars ?? 0;
}

export const MAX_CHIPS = 3;
export const MAX_ASPECTS = 3;

// Chip copy per category x tier. Each chip's `id` is what gets saved in a
// review's `highlights` -- keep ids stable if the labels are ever reworded
// so old reviews keep meaning the same thing.
export const CHIPS = {
  food: {
    'highly-recommend': [
      { id: 'great-food', label: 'Great food' },
      { id: 'love-vibe', label: 'Love the vibe' },
      { id: 'worth-price', label: 'Worth the price' },
    ],
    'worth-trying': [
      { id: 'food-okay', label: 'Food was okay' },
      { id: 'nice-spot', label: 'Nice spot' },
      { id: 'decent-price', label: 'Decent price' },
    ],
    'probably-skip': [
      { id: 'bad-food', label: 'Bad food' },
      { id: 'mediocre-vibe', label: 'Mediocre vibe' },
      { id: 'too-expensive', label: 'Too expensive' },
    ],
  },
  'art-museums': {
    'highly-recommend': [
      { id: 'stunning-collection', label: 'Stunning collection' },
      { id: 'great-curation', label: 'Great curation' },
      { id: 'worth-visiting', label: 'Worth visiting' },
    ],
    'worth-trying': [
      { id: 'decent-exhibits', label: 'Decent exhibits' },
      { id: 'decent-curation', label: 'Decent curation' },
      { id: 'average-experience', label: 'Average experience' },
    ],
    'probably-skip': [
      { id: 'underwhelming-exhibits', label: 'Underwhelming exhibits' },
      { id: 'crowded', label: 'Crowded' },
      { id: 'not-worth-it', label: 'Not worth it' },
    ],
  },
  'history-culture': {
    'highly-recommend': [
      { id: 'amazing-history', label: 'Amazing history' },
      { id: 'great-storytelling', label: 'Great storytelling' },
      { id: 'beautiful-building', label: 'Beautiful building' },
    ],
    'worth-trying': [
      { id: 'okay-exhibits', label: 'Okay exhibits' },
      { id: 'decent-tour', label: 'Decent tour' },
      { id: 'fine-spot', label: 'Fine spot' },
    ],
    'probably-skip': [
      { id: 'boring', label: 'Boring' },
      { id: 'not-maintained', label: 'Not maintained' },
      { id: 'overpriced', label: 'Overpriced' },
    ],
  },
  'parks-nature': {
    'highly-recommend': [
      { id: 'beautiful-views', label: 'Beautiful views' },
      { id: 'peaceful', label: 'Peaceful' },
      { id: 'great-for-a-walk', label: 'Great for a walk' },
    ],
    'worth-trying': [
      { id: 'nice-enough', label: 'Nice enough' },
      { id: 'bit-of-a-trek', label: 'Bit of a trek' },
      { id: 'crowded', label: 'Crowded' },
    ],
    'probably-skip': [
      { id: 'nothing-special', label: 'Nothing special' },
      { id: 'poorly-kept', label: 'Poorly kept' },
      { id: 'hard-to-get-to', label: 'Hard to get to' },
    ],
  },
  entertainment: {
    'highly-recommend': [
      { id: 'so-much-fun', label: 'So much fun' },
      { id: 'worth-the-ticket', label: 'Worth the ticket' },
      { id: 'great-for-families', label: 'Great for families' },
    ],
    'worth-trying': [
      { id: 'fun-but-pricey', label: 'Fun but pricey' },
      { id: 'decent-show', label: 'Decent show' },
      { id: 'long-lines', label: 'Long lines' },
    ],
    'probably-skip': [
      { id: 'not-worth-it', label: 'Not worth it' },
      { id: 'overpriced', label: 'Overpriced' },
      { id: 'underwhelming', label: 'Underwhelming' },
    ],
  },
  'local-life': {
    'highly-recommend': [
      { id: 'great-vibe', label: 'Great vibe' },
      { id: 'fun-crowd', label: 'Fun crowd' },
      { id: 'good-drinks', label: 'Good drinks' },
    ],
    'worth-trying': [
      { id: 'decent-night', label: 'Decent night out' },
      { id: 'hit-or-miss', label: 'Hit or miss' },
      { id: 'pricey-drinks', label: 'Pricey drinks' },
    ],
    'probably-skip': [
      { id: 'dead', label: 'Dead' },
      { id: 'sketchy', label: 'Sketchy' },
      { id: 'overpriced', label: 'Overpriced' },
    ],
  },
  sports: {
    'highly-recommend': [
      { id: 'great-facilities', label: 'Great facilities' },
      { id: 'so-much-fun', label: 'So much fun' },
      { id: 'easy-to-book', label: 'Easy to book' },
    ],
    'worth-trying': [
      { id: 'decent-facilities', label: 'Decent facilities' },
      { id: 'busy', label: 'Busy' },
      { id: 'a-bit-pricey', label: 'A bit pricey' },
    ],
    'probably-skip': [
      { id: 'run-down', label: 'Run down' },
      { id: 'always-full', label: 'Always full' },
      { id: 'overpriced', label: 'Overpriced' },
    ],
  },
  airports: {
    'highly-recommend': [
      { id: 'smooth-experience', label: 'Smooth experience' },
      { id: 'easy-to-navigate', label: 'Easy to navigate' },
      { id: 'good-food-shops', label: 'Good food & shops' },
    ],
    'worth-trying': [
      { id: 'gets-the-job-done', label: 'Gets the job done' },
      { id: 'long-walks', label: 'Long walks between gates' },
      { id: 'slow-security', label: 'Slow security' },
    ],
    'probably-skip': [
      { id: 'chaotic', label: 'Chaotic' },
      { id: 'endless-lines', label: 'Endless lines' },
      { id: 'overpriced', label: 'Overpriced' },
    ],
  },
};

export function chipsFor(landmark, tierId) {
  const cat = ratingCategory(landmark);
  return (cat && CHIPS[cat]?.[tierId]) || [];
}

// Label for a saved chip id, for showing old reviews back to the user even
// after the copy changes.
export function chipLabel(id) {
  for (const cat of Object.values(CHIPS)) {
    for (const list of Object.values(cat)) {
      const hit = list.find((c) => c.id === id);
      if (hit) return hit.label;
    }
  }
  return id;
}

// Ranked-aspect options per category. Price and Location are shared; the
// other two are what actually varies between a restaurant, a museum, and a
// historic site. Saved by id in lovedOrder / dislikedOrder.
export const ASPECT_SETS = {
  food: [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'atmosphere', label: 'Atmosphere' },
    { id: 'food', label: 'Food' },
  ],
  'art-museums': [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'exhibits', label: 'Exhibits' },
    { id: 'crowd-level', label: 'Crowd level' },
  ],
  'history-culture': [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'storytelling', label: 'Storytelling' },
    { id: 'architecture', label: 'Architecture' },
  ],
  'parks-nature': [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'scenery', label: 'Scenery' },
    { id: 'upkeep', label: 'Upkeep' },
  ],
  entertainment: [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'fun-factor', label: 'Fun factor' },
    { id: 'crowd-level', label: 'Crowd level' },
  ],
  'local-life': [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'vibe', label: 'Vibe' },
    { id: 'crowd', label: 'Crowd' },
  ],
  sports: [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'facilities', label: 'Facilities' },
    { id: 'availability', label: 'Availability' },
  ],
  airports: [
    { id: 'price', label: 'Price' },
    { id: 'location', label: 'Location' },
    { id: 'security-wait', label: 'Security wait' },
    { id: 'amenities', label: 'Food & shops' },
  ],
};

export function aspectsFor(landmark) {
  const cat = ratingCategory(landmark);
  return (cat && ASPECT_SETS[cat]) || [];
}

export function aspectLabel(id) {
  for (const list of Object.values(ASPECT_SETS)) {
    const hit = list.find((a) => a.id === id);
    if (hit) return hit.label;
  }
  return id;
}

export function categoryLabel(id) {
  if (id === 'food-local-life') return 'Food & Local Life';
  return INTERESTS.find((i) => i.id === id)?.label || id;
}

// The number we say out loud: "Rate 10 places and Mapr gets noticeably
// better." A reasoned hypothesis, not a measured cliff -- see the feature
// doc. Swap this once real retention-by-ratings-count data is in.
export const RATING_GOAL = 10;
export const TASTE_CARD_MIN_RATINGS = 5;
