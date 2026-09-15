import { INTERESTS } from '../data/regions';

// Only these categories get the rating flow. A landmark that's ONLY
// campus-life (a dorm, a dining hall) skips straight to "checked in" --
// rating a residence hall on Food/Atmosphere/Service tells Mapr nothing.
// Order matters: a landmark tagged with several of these takes its chip
// set from the first match here.
export const RATEABLE_CATEGORIES = ['history-culture', 'art-museums', 'food-local-life'];

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

// Universal for now (same four for every rateable category) -- the spec
// flagged "confirm if universal or category-specific" as still open.
export const ASPECTS = [
  { id: 'food', label: 'Food' },
  { id: 'atmosphere', label: 'Atmosphere' },
  { id: 'service', label: 'Service' },
  { id: 'location', label: 'Location' },
];

export function aspectLabel(id) {
  return ASPECTS.find((a) => a.id === id)?.label || id;
}

// PLACEHOLDER COPY -- the real chip wording (3 categories x 3 tiers) is
// still to come and drops in here, nowhere else. Each chip's `id` is what
// gets saved in the review's `highlights`; keep ids stable when the labels
// change so old reviews keep meaning the same thing.
export const CHIPS = {
  'history-culture': {
    'highly-recommend': [
      { id: 'rich-history', label: 'Rich history' },
      { id: 'stunning-architecture', label: 'Stunning architecture' },
      { id: 'worth-the-hype', label: 'Worth the hype' },
      { id: 'great-for-photos', label: 'Great for photos' },
      { id: 'moving', label: 'Moving' },
    ],
    'worth-trying': [
      { id: 'quick-stop', label: 'Quick stop' },
      { id: 'nice-not-essential', label: 'Nice, not essential' },
      { id: 'better-with-a-guide', label: 'Better with a guide' },
      { id: 'crowded', label: 'Crowded' },
    ],
    'probably-skip': [
      { id: 'overcrowded', label: 'Overcrowded' },
      { id: 'overpriced', label: 'Overpriced' },
      { id: 'not-much-to-see', label: 'Not much to see' },
      { id: 'tourist-trap', label: 'Tourist trap' },
    ],
  },
  'art-museums': {
    'highly-recommend': [
      { id: 'loved-the-art', label: 'Loved the art' },
      { id: 'worth-the-hype', label: 'Worth the hype' },
      { id: 'great-for-photos', label: 'Great for photos' },
      { id: 'well-curated', label: 'Well curated' },
      { id: 'could-stay-all-day', label: 'Could stay all day' },
    ],
    'worth-trying': [
      { id: 'quick-stop', label: 'Quick stop' },
      { id: 'hit-or-miss', label: 'Hit or miss' },
      { id: 'one-great-room', label: 'One great room' },
      { id: 'crowded', label: 'Crowded' },
    ],
    'probably-skip': [
      { id: 'overcrowded', label: 'Overcrowded' },
      { id: 'overpriced', label: 'Overpriced' },
      { id: 'not-much-to-see', label: 'Not much to see' },
      { id: 'underwhelming', label: 'Underwhelming' },
    ],
  },
  'food-local-life': {
    'highly-recommend': [
      { id: 'delicious', label: 'Delicious' },
      { id: 'great-vibe', label: 'Great vibe' },
      { id: 'local-favorite', label: 'Local favorite' },
      { id: 'good-value', label: 'Good value' },
      { id: 'would-come-back', label: 'Would come back' },
    ],
    'worth-trying': [
      { id: 'decent', label: 'Decent' },
      { id: 'pricey-for-what-it-is', label: 'Pricey for what it is' },
      { id: 'long-wait', label: 'Long wait' },
      { id: 'hit-or-miss', label: 'Hit or miss' },
    ],
    'probably-skip': [
      { id: 'overpriced', label: 'Overpriced' },
      { id: 'bland', label: 'Bland' },
      { id: 'tourist-trap', label: 'Tourist trap' },
      { id: 'slow-service', label: 'Slow service' },
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

export function categoryLabel(id) {
  return INTERESTS.find((i) => i.id === id)?.label || id;
}

// The number we say out loud: "Rate 10 places and Mapr gets noticeably
// better." A reasoned hypothesis, not a measured cliff -- see the feature
// doc. Swap this once real retention-by-ratings-count data is in.
export const RATING_GOAL = 10;
export const TASTE_CARD_MIN_RATINGS = 5;
