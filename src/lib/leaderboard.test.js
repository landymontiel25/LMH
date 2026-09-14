import { describe, it, expect } from 'vitest';
import { periodKeys } from './leaderboard';

describe('periodKeys', () => {
  it('computes matching weekly/monthly/yearly keys for a known date', () => {
    // 2026-03-04 is a Wednesday in ISO week 10 of 2026.
    const keys = periodKeys(new Date(Date.UTC(2026, 2, 4)));
    expect(keys).toEqual({ weekly: '2026-W10', monthly: '2026-03', yearly: '2026' });
  });

  it('keeps the same weekly key across a Mon-Sun span', () => {
    // ISO weeks run Monday-Sunday. 2026-03-02 (Mon) through 2026-03-08 (Sun)
    // is one ISO week -- ISO week 10.
    const monday = periodKeys(new Date(Date.UTC(2026, 2, 2)));
    const sunday = periodKeys(new Date(Date.UTC(2026, 2, 8)));
    expect(monday.weekly).toBe(sunday.weekly);
  });

  it('rolls the monthly/yearly keys over on Jan 1', () => {
    const keys = periodKeys(new Date(Date.UTC(2027, 0, 1)));
    expect(keys.monthly).toBe('2027-01');
    expect(keys.yearly).toBe('2027');
  });
});
