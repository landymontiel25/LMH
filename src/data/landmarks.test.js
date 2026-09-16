import { describe, expect, it } from 'vitest';
import { ALL_LANDMARKS, INTERESTS, sortInterests } from './regions';

const KNOWN = new Set(INTERESTS.map((i) => i.id));

describe('landmark catalog', () => {
  it('gives every landmark exactly one known category', () => {
    const bad = ALL_LANDMARKS.filter((l) => !Array.isArray(l.categories) || l.categories.length !== 1 || !KNOWN.has(l.categories[0]));
    expect(bad.map((l) => `${l.regionId}/${l.id}: ${JSON.stringify(l.categories)}`)).toEqual([]);
  });

  it('keeps Local Life to bars, clubs and live music', () => {
    const local = ALL_LANDMARKS.filter((l) => l.categories[0] === 'local-life').map((l) => l.id);
    expect(local.length).toBeLessThanOrEqual(12);
    expect(local).toContain('ball-and-chain');
    expect(local).not.toContain('calle-ocho');
  });

  it('never repeats a region/id pair', () => {
    const keys = ALL_LANDMARKS.map((l) => `${l.regionId}/${l.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('sortInterests', () => {
  it('orders A–Z by default, newest and oldest by when the category was added', () => {
    expect(sortInterests(INTERESTS)[0].label).toBe('10/10 Benches');
    expect(sortInterests(INTERESTS, 'newest')[0].id).toBe('benches');
    expect(sortInterests(INTERESTS, 'oldest')[0].id).toBe('history-culture');
    expect(new Set(INTERESTS.map((i) => i.added)).size).toBe(INTERESTS.length);
  });
});
