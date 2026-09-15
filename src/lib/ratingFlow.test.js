import { describe, it, expect } from 'vitest';
import {
  RATEABLE_CATEGORIES,
  isRateable,
  ratingCategory,
  TIERS,
  tierStars,
  chipsFor,
  chipLabel,
  MAX_CHIPS,
  MAX_ASPECTS,
  ASPECTS,
  RATING_GOAL,
} from './ratingFlow';

describe('rateability gate', () => {
  it('rates history, art, and food landmarks', () => {
    for (const c of RATEABLE_CATEGORIES) {
      expect(isRateable({ categories: [c] })).toBe(true);
    }
  });

  it('skips a campus-only landmark', () => {
    expect(isRateable({ categories: ['campus-life'] })).toBe(false);
  });

  it('rates a mixed campus + rateable landmark', () => {
    expect(isRateable({ categories: ['campus-life', 'food-local-life'] })).toBe(true);
  });

  it('fails safe on a landmark with no categories', () => {
    expect(isRateable({})).toBe(false);
    expect(isRateable({ categories: [] })).toBe(false);
    expect(isRateable(null)).toBe(false);
  });

  it('picks the chip set from the first rateable category, in priority order', () => {
    expect(ratingCategory({ categories: ['food-local-life', 'history-culture'] })).toBe('history-culture');
    expect(ratingCategory({ categories: ['campus-life', 'art-museums'] })).toBe('art-museums');
    expect(ratingCategory({ categories: ['campus-life'] })).toBe(null);
  });
});

describe('tier -> stars (feeds the landmark_ratings aggregate)', () => {
  it('maps the three tiers onto the 1-5 scale the aggregate expects', () => {
    expect(tierStars('highly-recommend')).toBe(5);
    expect(tierStars('worth-trying')).toBe(3);
    expect(tierStars('probably-skip')).toBe(1);
  });

  it('returns 0 for an unknown or missing tier so submitReview rejects it', () => {
    expect(tierStars('five-stars')).toBe(0);
    expect(tierStars(undefined)).toBe(0);
  });

  it('exposes exactly three tiers with unique ids', () => {
    expect(TIERS).toHaveLength(3);
    expect(new Set(TIERS.map((t) => t.id)).size).toBe(3);
  });
});

describe('chips', () => {
  it('has a chip set for every rateable category x tier', () => {
    for (const c of RATEABLE_CATEGORIES) {
      for (const t of TIERS) {
        const chips = chipsFor({ categories: [c] }, t.id);
        expect(chips.length, `${c} / ${t.id}`).toBeGreaterThanOrEqual(3);
        expect(chips.length, `${c} / ${t.id}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('returns no chips for a non-rateable landmark', () => {
    expect(chipsFor({ categories: ['campus-life'] }, 'highly-recommend')).toEqual([]);
  });

  it('keeps chip ids unique within a set so highlights can be toggled by id', () => {
    for (const c of RATEABLE_CATEGORIES) {
      for (const t of TIERS) {
        const ids = chipsFor({ categories: [c] }, t.id).map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('resolves a saved chip id back to its label', () => {
    const [first] = chipsFor({ categories: ['food-local-life'] }, 'highly-recommend');
    expect(chipLabel(first.id)).toBe(first.label);
    expect(chipLabel('not-a-real-chip')).toBe('not-a-real-chip');
  });
});

describe('limits and aspects', () => {
  it('caps picks at 3 chips and 3 ranked aspects', () => {
    expect(MAX_CHIPS).toBe(3);
    expect(MAX_ASPECTS).toBe(3);
  });

  it('offers the four universal aspects', () => {
    expect(ASPECTS.map((a) => a.id)).toEqual(['food', 'atmosphere', 'service', 'location']);
  });

  it('sets the marketing goal at 10 ratings', () => {
    expect(RATING_GOAL).toBe(10);
  });
});
