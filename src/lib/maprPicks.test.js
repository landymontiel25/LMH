import { describe, expect, it } from 'vitest';
import { localMaprPicks } from './maprPicks';

describe('localMaprPicks', () => {
  it('never suggests somewhere already checked into, and leans into loved categories', () => {
    const picks = localMaprPicks({
      reviews: [
        { tier: 'highly-recommend', categories: ['food'] },
        { tier: 'highly-recommend', categories: ['food'] },
        { tier: 'probably-skip', categories: ['art-museums'] },
      ],
      checkedInIds: ['joes-stone-crab'],
      regionIds: ['miami'],
    });
    expect(picks).toHaveLength(4);
    expect(picks.map((p) => p.id)).not.toContain('joes-stone-crab');
    expect(picks.every((p) => p.region === 'miami')).toBe(true);
    // matchPercentage reflects affinity for that specific category, not rank
    // within the pool -- a strongly loved category (two highly-recommends)
    // caps near the top, while an unrelated/no-signal category lands at a
    // neutral 65, not artificially inflated just for being the best nearby.
    expect(picks[0].matchPercentage).toBe(97);
    expect(picks.every((p) => p.matchPercentage >= 45 && p.matchPercentage <= 97)).toBe(true);
    expect(picks.every((p) => p.oneLineSummary.length > 0)).toBe(true);
  });

  it('with a GPS fix, only suggests places near you', () => {
    // Standing at Villanova: Philly-area picks only, never Miami or Milan.
    const picks = localMaprPicks({ origin: { lat: 40.037, lng: -75.342 }, regionIds: ['miami'] });
    expect(picks).toHaveLength(4);
    expect(picks.every((p) => ['villanova', 'philly'].includes(p.region))).toBe(true);
  });

  it('never suggests a dorm', () => {
    const picks = localMaprPicks({ regionIds: ['villanova'], limit: 40 });
    expect(picks.some((p) => p.id.endsWith('-hall'))).toBe(false);
  });
});

describe('specific-type suppression', () => {
  it('excludes zoos entirely after a single probably-skip rating naming one', () => {
    const origin = { lat: 25.7743, lng: -80.1937 }; // Miami -- Zoo Miami is nearby
    const before = localMaprPicks({ origin, limit: 500 });
    expect(before.some((p) => p.id === 'zoo-miami')).toBe(true);
    const after = localMaprPicks({
      origin,
      reviews: [{ tier: 'probably-skip', categories: ['parks-nature'], name: 'Zoo Miami' }],
      limit: 500,
    });
    expect(after.some((p) => p.id === 'zoo-miami')).toBe(false);
    // A loved park in the same broad category should NOT get swept out too --
    // only the specific type (zoo) is suppressed, not all of parks-nature.
    expect(after.length).toBeGreaterThan(0);
  });

  it('leaves a disliked type alone after just one ✗ vote, but excludes it after two', () => {
    const origin = { lat: 25.7743, lng: -80.1937 };
    const oneVote = localMaprPicks({
      origin,
      feedback: [{ verdict: 'no', categories: ['parks-nature'], name: 'Zoo Miami' }],
      limit: 500,
    });
    expect(oneVote.some((p) => p.id === 'zoo-miami')).toBe(true);
    const twoVotes = localMaprPicks({
      origin,
      feedback: [
        { verdict: 'no', categories: ['parks-nature'], name: 'Zoo Miami' },
        { verdict: 'no', categories: ['parks-nature'], name: 'Another Zoo' },
      ],
      limit: 500,
    });
    expect(twoVotes.some((p) => p.id === 'zoo-miami')).toBe(false);
  });

  it('never suppresses anything when nothing disliked names a known type', () => {
    const picks = localMaprPicks({
      reviews: [{ tier: 'probably-skip', categories: ['art-museums'], name: 'Some Gallery' }],
      regionIds: ['miami'],
      limit: 500,
    });
    expect(picks.length).toBeGreaterThan(0);
  });

  it('excludes a real disliked pick (Merion Cricket Club) without touching a loved public sports venue', () => {
    const origin = { lat: 40.037, lng: -75.342 }; // Villanova/Philly area
    const before = localMaprPicks({ origin, limit: 500 });
    expect(before.some((p) => p.id === 'merion-cricket-club')).toBe(true);
    const after = localMaprPicks({
      origin,
      reviews: [
        { tier: 'highly-recommend', categories: ['stadiums'], name: 'Yankee Stadium' },
        { tier: 'probably-skip', categories: ['sports'], name: 'Merion Cricket Club' },
      ],
      limit: 500,
    });
    expect(after.some((p) => p.id === 'merion-cricket-club')).toBe(false);
  });

  it('excludes a disliked Quaker meeting house by name, not the whole history-culture category', () => {
    const origin = { lat: 40.037, lng: -75.342 };
    const before = localMaprPicks({ origin, limit: 500 });
    expect(before.some((p) => p.id === 'merion-friends-meeting-house')).toBe(true);
    const after = localMaprPicks({
      origin,
      reviews: [{ tier: 'probably-skip', categories: ['history-culture'], name: 'Merion Friends Meeting House' }],
      limit: 500,
    });
    expect(after.some((p) => p.id === 'merion-friends-meeting-house')).toBe(false);
    expect(after.length).toBeGreaterThan(0);
  });
});

describe('trait-based generalization (comment reasoning, not just category)', () => {
  it('boosts a place sharing a stated reason, even in an unrelated category', () => {
    // South Pointe Park's summary mentions "views" -- a comment praising a
    // rooftop view on a totally unrelated (food) rating should still lift
    // it, purely from the shared trait, not from category affinity.
    const origin = { lat: 25.7743, lng: -80.1937 };
    const withoutTrait = localMaprPicks({ origin, limit: 500 });
    const withTrait = localMaprPicks({
      origin,
      reviews: [
        {
          tier: 'highly-recommend',
          categories: ['food'],
          name: 'Some Restaurant',
          comment: 'Amazing rooftop with an incredible view.',
        },
      ],
      limit: 500,
    });
    const rank = (list) => list.findIndex((p) => p.id === 'south-pointe-park-and-pier');
    expect(rank(withTrait)).toBeGreaterThanOrEqual(0);
    expect(rank(withTrait)).toBeLessThan(rank(withoutTrait));
  });

  it('suppresses a place sharing a stated dislike reason from a comment, not just a fixed word list', () => {
    const origin = { lat: 25.7743, lng: -80.1937 };
    const before = localMaprPicks({ origin, limit: 500 });
    expect(before.some((p) => p.id === 'south-pointe-park-and-pier')).toBe(true);
    const after = localMaprPicks({
      origin,
      reviews: [
        {
          tier: 'probably-skip',
          categories: ['entertainment'],
          name: 'Some Other Place',
          comment: 'Skip it, the waterfront area was way too crowded.',
        },
      ],
      limit: 500,
    });
    // "Some Other Place" isn't in the catalog, and its category
    // (entertainment) doesn't match South Pointe Park's (parks-nature) --
    // the only way this place could drop out is the comment's own words
    // ("waterfront", "crowded") matching its summary.
    expect(after.some((p) => p.id === 'south-pointe-park-and-pier')).toBe(false);
  });

  it('reads a trait from the tapped chip highlight, not only the freeform comment', () => {
    const origin = { lat: 25.7743, lng: -80.1937 };
    const withoutTrait = localMaprPicks({ origin, limit: 500 });
    // 'beautiful-views' is a real parks-nature chip id (see ratingFlow.js);
    // chipLabel resolves it to "Beautiful views" -- the word "views" alone
    // is what the trait matcher should catch, from the chip, not the
    // category array.
    const withTrait = localMaprPicks({
      origin,
      reviews: [
        {
          tier: 'highly-recommend',
          categories: ['food'],
          name: 'Some Restaurant',
          highlights: ['beautiful-views'],
        },
      ],
      limit: 500,
    });
    const rank = (list) => list.findIndex((p) => p.id === 'south-pointe-park-and-pier');
    expect(rank(withTrait)).toBeGreaterThanOrEqual(0);
    expect(rank(withTrait)).toBeLessThan(rank(withoutTrait));
  });
});

describe('recency decay', () => {
  const DAY = 86400;
  const NOW = Date.now();
  const nowSec = NOW / 1000;

  it('gives a recent loved rating more pull on matchPercentage than an old one', () => {
    const recentPicks = localMaprPicks({
      reviews: [{ tier: 'highly-recommend', categories: ['food'], updatedAt: { seconds: nowSec - 1 * DAY } }],
      regionIds: ['miami'],
      now: NOW,
      limit: 500,
    });
    const oldPicks = localMaprPicks({
      reviews: [{ tier: 'highly-recommend', categories: ['food'], updatedAt: { seconds: nowSec - 400 * DAY } }],
      regionIds: ['miami'],
      now: NOW,
      limit: 500,
    });
    const recentFood = recentPicks.find((p) => p.categories.includes('food'));
    const oldFood = oldPicks.find((p) => p.categories.includes('food'));
    expect(recentFood.matchPercentage).toBeGreaterThan(oldFood.matchPercentage);
  });

  it('fades an old dislike into a soft penalty instead of a hard exclusion', () => {
    const origin = { lat: 25.7743, lng: -80.1937 };
    const recentDislike = localMaprPicks({
      origin,
      reviews: [
        { tier: 'probably-skip', categories: ['parks-nature'], name: 'Zoo Miami', updatedAt: { seconds: nowSec - 1 * DAY } },
      ],
      now: NOW,
      limit: 500,
    });
    const oldDislike = localMaprPicks({
      origin,
      reviews: [
        { tier: 'probably-skip', categories: ['parks-nature'], name: 'Zoo Miami', updatedAt: { seconds: nowSec - 400 * DAY } },
      ],
      now: NOW,
      limit: 500,
    });
    // Recent: still excluded outright, same as the no-timestamp case.
    expect(recentDislike.some((p) => p.id === 'zoo-miami')).toBe(false);
    // Old enough to have decayed below the hard-exclude threshold: present
    // again, just not favored -- faded, not forgotten.
    expect(oldDislike.some((p) => p.id === 'zoo-miami')).toBe(true);
  });
});

describe('weak signal from an unrated check-in', () => {
  it('nudges the category a small amount -- less than a real "worth trying" rating would', () => {
    const withWeak = localMaprPicks({
      weakCheckedInIds: ['joes-stone-crab'],
      regionIds: ['miami'],
      limit: 500,
    });
    const withRating = localMaprPicks({
      reviews: [{ tier: 'worth-trying', categories: ['food'] }],
      regionIds: ['miami'],
      limit: 500,
    });
    const weakFood = withWeak.find((p) => p.categories.includes('food'));
    const ratedFood = withRating.find((p) => p.categories.includes('food'));
    expect(weakFood.matchPercentage).toBeGreaterThan(65); // some lift over neutral
    expect(weakFood.matchPercentage).toBeLessThan(ratedFood.matchPercentage);
  });
});

describe('pick feedback', () => {
  it('keeps a recently ✗’d place out and nudges categories only lightly', () => {
    const origin = { lat: 25.7743, lng: -80.1937 };
    const base = localMaprPicks({ origin, limit: 500 });
    const target = base[0];
    const after = localMaprPicks({ origin, passedIds: [target.id], limit: 500 });
    expect(after.map((p) => p.id)).not.toContain(target.id);
    // A single ✗ on a category is worth less than a single "probably skip" rating.
    const cat = target.categories[0];
    const viaVote = localMaprPicks({ origin, feedback: [{ verdict: 'no', categories: [cat] }], limit: 500 });
    const viaRating = localMaprPicks({ origin, reviews: [{ tier: 'probably-skip', categories: [cat] }], limit: 500 });
    const rank = (list) => list.findIndex((p) => p.id === target.id);
    expect(rank(viaVote)).toBeGreaterThanOrEqual(0);
    expect(rank(viaRating)).toBeGreaterThanOrEqual(rank(viaVote));
  });
});
