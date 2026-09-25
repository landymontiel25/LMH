import { describe, it, expect } from 'vitest';
import { ALL_LANDMARKS } from '../data/regions';
import {
  applyRating,
  buildShortlist,
  coldStartShortlist,
  decayFactor,
  effectiveTagScores,
  pendingCapPrompt,
  pickRegion,
  rebuildTagScores,
  scoreShortlist,
  TAG_CAP,
} from './tagScores';

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1);

describe('applyRating', () => {
  it('applies +10 / +2 / -15 per tag', () => {
    expect(applyRating({}, ['food'], 'highly-recommend', T0).scores).toEqual({ food: 10 });
    expect(applyRating({}, ['food'], 'worth-trying', T0).scores).toEqual({ food: 2 });
    expect(applyRating({}, ['food'], 'probably-skip', T0).scores).toEqual({ food: -15 });
  });

  it('ignores ratings without a known tier', () => {
    expect(applyRating({}, ['food'], null, T0).scores).toEqual({});
  });

  it('decays the old score before adding the new rating', () => {
    const next = applyRating({ scores: { food: 10 }, at: { food: T0 } }, ['food'], 'highly-recommend', T0 + 90 * DAY);
    expect(next.scores.food).toBeCloseTo(15);
  });

  it('caps at 100 and reports the tag that hit it', () => {
    let state = { scores: {}, at: {} };
    let capped = [];
    for (let i = 0; i < 12; i++) {
      const next = applyRating(state, ['food'], 'highly-recommend', T0);
      state = { scores: { ...state.scores, ...next.scores }, at: { ...state.at, ...next.at } };
      capped = next.capped;
    }
    expect(state.scores.food).toBe(TAG_CAP);
    expect(capped).toEqual(['food']);
  });
});

describe('decay and boosts', () => {
  it('halves a score every 90 days', () => {
    expect(decayFactor(T0, T0 + 90 * DAY)).toBeCloseTo(0.5);
    const profile = { tagScores: { milan: { food: 100 } }, tagScoresAt: { milan: { food: T0 } } };
    expect(effectiveTagScores(profile, 'milan', T0 + 90 * DAY).food).toBeCloseTo(50);
  });

  it('applies the 1.5x boost above the cap in ranking only', () => {
    const profile = {
      tagScores: { milan: { food: 100 } },
      tagScoresAt: { milan: { food: T0 } },
      tagBoosts: { milan: { food: 'yes' } },
    };
    expect(effectiveTagScores(profile, 'milan', T0).food).toBe(150);
    expect(profile.tagScores.milan.food).toBe(100);
  });

  it('keeps regions separate', () => {
    const profile = { tagScores: { milan: { food: 40 } }, tagScoresAt: { milan: { food: T0 } } };
    expect(effectiveTagScores(profile, 'miami', T0)).toEqual({});
  });
});

describe('pendingCapPrompt', () => {
  it('asks about a capped tag until it is answered', () => {
    const profile = { tagScores: { milan: { food: 100, 'art-museums': 40 } } };
    expect(pendingCapPrompt(profile)).toEqual({ region: 'milan', tag: 'food' });
    expect(pendingCapPrompt({ ...profile, tagBoosts: { milan: { food: 'no' } } })).toBeNull();
  });
});

describe('rebuildTagScores', () => {
  it('matches replaying the same ratings live', () => {
    const reviews = [
      { region: 'milan', categories: ['food'], ratingTier: 'probably-skip', updatedAt: { seconds: (T0 + 30 * DAY) / 1000 } },
      { region: 'milan', categories: ['food'], ratingTier: 'highly-recommend', updatedAt: { seconds: T0 / 1000 } },
    ];
    const { tagScores, tagScoresAt } = rebuildTagScores(reviews);
    const first = applyRating({}, ['food'], 'highly-recommend', T0);
    const second = applyRating(first, ['food'], 'probably-skip', T0 + 30 * DAY);
    expect(tagScores.milan.food).toBeCloseTo(second.scores.food);
    expect(tagScoresAt.milan.food).toBe(T0 + 30 * DAY);
  });
});

describe('shortlists', () => {
  const milan = ALL_LANDMARKS.filter((l) => l.regionId === 'milan');
  const topTag = 'food';

  it('ranks the highest-scoring tag first, excludes visited, caps at 30', () => {
    const visited = milan.find((l) => l.categories[0] === topTag).id;
    const list = scoreShortlist({ scores: { [topTag]: 50, 'history-culture': -20 }, region: 'milan', excludeIds: [visited] });
    expect(list.length).toBeLessThanOrEqual(30);
    expect(list[0].categories[0]).toBe(topTag);
    expect(list.some((l) => l.id === visited)).toBe(false);
    expect(list.every((l) => l.regionId === 'milan')).toBe(true);
  });

  it('breaks ties by check-in count', () => {
    const foods = milan.filter((l) => l.categories[0] === 'food');
    const underdog = foods.at(-1);
    const list = scoreShortlist({ scores: { food: 10 }, region: 'milan', checkinCounts: { [underdog.id]: 99 } });
    expect(list[0].id).toBe(underdog.id);
  });

  it('cold start puts signup interests first, most-visited first', () => {
    const arts = milan.filter((l) => l.categories[0] === 'art-museums');
    const busiest = arts.at(-1);
    const list = coldStartShortlist({ region: 'milan', interests: ['art-museums'], checkinCounts: { [busiest.id]: 7 } });
    expect(list[0].id).toBe(busiest.id);
    expect(list.slice(0, arts.length).every((l) => l.categories[0] === 'art-museums')).toBe(true);
  });

  it('uses cold start only when the region has no rating signal', () => {
    expect(buildShortlist({ profile: {}, region: 'milan' }).coldStart).toBe(true);
    const profile = { tagScores: { milan: { food: 10 } }, tagScoresAt: { milan: { food: Date.now() } } };
    expect(buildShortlist({ profile, region: 'milan' }).coldStart).toBe(false);
  });

  it('never shortlists dorms or campus-life', () => {
    const list = coldStartShortlist({ region: 'villanova', limit: 500 });
    expect(list.some((l) => ['dorms', 'campus-life'].includes(l.categories[0]))).toBe(false);
  });
});

describe('pickRegion', () => {
  it('finds the region nearest a GPS fix, else falls back', () => {
    expect(pickRegion({ origin: { lat: 45.4642, lng: 9.19 } })).toBe('milan');
    expect(pickRegion({ origin: null, fallbackRegions: [undefined, 'miami'] })).toBe('miami');
  });
});
