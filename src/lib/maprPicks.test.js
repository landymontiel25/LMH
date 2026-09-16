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
    expect(picks[0].matchPercentage).toBe(98);
    expect(picks.every((p) => p.matchPercentage >= 70 && p.matchPercentage <= 98)).toBe(true);
    expect(picks.every((p) => p.oneLineSummary.length > 0)).toBe(true);
  });

  it('never suggests a dorm', () => {
    const picks = localMaprPicks({ regionIds: ['villanova'], limit: 40 });
    expect(picks.some((p) => p.id.endsWith('-hall'))).toBe(false);
  });
});
