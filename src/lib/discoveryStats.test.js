import { describe, it, expect } from 'vitest';
import { computeNewPlacesThisWeek } from './discoveryStats';

const NOW = new Date('2026-09-25T18:00:00Z').getTime();
const sec = (offsetDays) => Math.floor((NOW + offsetDays * 86400000) / 1000);

describe('computeNewPlacesThisWeek', () => {
  it('counts first-visit check-ins from the last 7 days as new places', () => {
    const checkins = [
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-2) } },
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-6) } },
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-10) } }, // too old
      { visited: true, visitNumber: 2, createdAt: { seconds: sec(-1) } }, // repeat, not new
    ];
    expect(computeNewPlacesThisWeek(checkins, NOW)).toBe(2);
  });

  it('treats legacy check-ins with no visitNumber as a first visit', () => {
    const checkins = [{ visited: true, createdAt: { seconds: sec(-1) } }];
    expect(computeNewPlacesThisWeek(checkins, NOW)).toBe(1);
  });

  it('excludes ratingOnly claims', () => {
    const checkins = [{ ratingOnly: true, visitNumber: 1, createdAt: { seconds: sec(0) } }];
    expect(computeNewPlacesThisWeek(checkins, NOW)).toBe(0);
  });

  it('is a straight count, not an estimate -- returns 0 for no check-ins', () => {
    expect(computeNewPlacesThisWeek([], NOW)).toBe(0);
  });
});
