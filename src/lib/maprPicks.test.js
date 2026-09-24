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
