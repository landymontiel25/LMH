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
  ASPECT_SETS,
  aspectsFor,
  aspectLabel,
  RATING_GOAL,
} from './ratingFlow';
import { INTERESTS } from '../data/regions';

describe('rateability gate', () => {
  it('rates history, art, and food landmarks', () => {
    for (const c of RATEABLE_CATEGORIES) {
      expect(isRateable({ categories: [c] })).toBe(true);
    }
  });

  it('rates parks and entertainment too, and lists them as onboarding interests', () => {
    expect(isRateable({ categories: ['parks-nature'] })).toBe(true);
    expect(isRateable({ categories: ['entertainment'] })).toBe(true);
    const ids = INTERESTS.map((i) => i.id);
    expect(ids).toContain('parks-nature');
    expect(ids).toContain('entertainment');
    expect(ids).toHaveLength(6);
  });

  it('a park that is also historic rates as a park', () => {
    expect(ratingCategory({ categories: ['history-culture', 'parks-nature'] })).toBe('parks-nature');
    expect(ratingCategory({ categories: ['parks-nature', 'history-culture'] })).toBe('parks-nature');
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

  it('offers four aspects per rateable category, with Price and Location shared', () => {
    for (const c of RATEABLE_CATEGORIES) {
      const ids = ASPECT_SETS[c].map((a) => a.id);
      expect(ids, c).toHaveLength(4);
      expect(ids, c).toContain('price');
      expect(ids, c).toContain('location');
      expect(new Set(ids).size, c).toBe(4);
    }
    expect(aspectsFor({ categories: ['food-local-life'] }).map((a) => a.id)).toEqual([
      'price',
      'location',
      'atmosphere',
      'food',
    ]);
    expect(aspectsFor({ categories: ['art-museums'] }).map((a) => a.id)).toEqual([
      'price',
      'location',
      'exhibits',
      'crowd-level',
    ]);
    expect(aspectsFor({ categories: ['history-culture'] }).map((a) => a.id)).toEqual([
      'price',
      'location',
      'storytelling',
      'architecture',
    ]);
  });

  it('gives parks and entertainment their own third and fourth aspects', () => {
    expect(aspectsFor({ categories: ['parks-nature'] }).map((a) => a.id)).toEqual([
      'price',
      'location',
      'scenery',
      'upkeep',
    ]);
    expect(aspectsFor({ categories: ['entertainment'] }).map((a) => a.id)).toEqual([
      'price',
      'location',
      'fun-factor',
      'crowd-level',
    ]);
  });

  it('offers no aspects for a non-rateable landmark', () => {
    expect(aspectsFor({ categories: ['campus-life'] })).toEqual([]);
  });

  it('resolves a saved aspect id back to its label', () => {
    expect(aspectLabel('crowd-level')).toBe('Crowd level');
    expect(aspectLabel('not-an-aspect')).toBe('not-an-aspect');
  });

  it('sets the marketing goal at 10 ratings', () => {
    expect(RATING_GOAL).toBe(10);
  });
});
