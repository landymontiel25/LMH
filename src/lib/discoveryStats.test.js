import { describe, it, expect } from 'vitest';
import { computeDiscoveryStats } from './discoveryStats';

const NOW = new Date('2026-09-25T18:00:00Z').getTime();
const sec = (isoOffsetDays) => Math.floor((NOW + isoOffsetDays * 86400000) / 1000);

describe('computeDiscoveryStats', () => {
  it('counts first-visit check-ins from the last 7 days as new places', () => {
    const checkins = [
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-2) } },
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-6) } },
      { visited: true, visitNumber: 1, createdAt: { seconds: sec(-10) } }, // too old
      { visited: true, visitNumber: 2, createdAt: { seconds: sec(-1) } }, // repeat, not new
    ];
    expect(computeDiscoveryStats(checkins, NOW).newPlacesThisWeek).toBe(2);
  });

  it('treats legacy check-ins with no visitNumber as a first visit', () => {
    const checkins = [{ visited: true, createdAt: { seconds: sec(-1) } }];
    expect(computeDiscoveryStats(checkins, NOW).newPlacesThisWeek).toBe(1);
  });

  it('excludes ratingOnly claims from both stats', () => {
    const checkins = [{ ratingOnly: true, visitNumber: 1, createdAt: { seconds: sec(0) } }];
    const stats = computeDiscoveryStats(checkins, NOW);
    expect(stats.newPlacesThisWeek).toBe(0);
    expect(stats.minutesSavedToday).toBe(0);
  });

  it('counts every real check-in logged today toward minutes saved', () => {
    const todayNoon = Math.floor(new Date('2026-09-25T12:00:00Z').getTime() / 1000);
    const yesterday = Math.floor(new Date('2026-09-24T12:00:00Z').getTime() / 1000);
    const checkins = [
      { visited: true, createdAt: { seconds: todayNoon } },
      { visited: true, createdAt: { seconds: todayNoon } },
      { visited: true, createdAt: { seconds: yesterday } },
    ];
    expect(computeDiscoveryStats(checkins, NOW).minutesSavedToday).toBe(8);
  });

  it('returns zeros for no check-ins', () => {
    expect(computeDiscoveryStats([], NOW)).toEqual({ newPlacesThisWeek: 0, minutesSavedToday: 0 });
  });
});
