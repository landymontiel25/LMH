import { describe, it, expect } from 'vitest';
import { levelForPoints, levelProgress } from './level';

describe('levelForPoints', () => {
  it('starts at level 1 with zero points', () => {
    expect(levelForPoints(0)).toBe(1);
  });

  it('reaches level 2 at 100 points (one check-in)', () => {
    expect(levelForPoints(100)).toBe(2);
  });

  it('reaches level 3 at 400 points', () => {
    expect(levelForPoints(400)).toBe(3);
  });

  it('does not level up early', () => {
    expect(levelForPoints(399)).toBe(2);
  });
});

describe('levelProgress', () => {
  it('reports 0% right at the start of a level', () => {
    const p = levelProgress(400);
    expect(p.level).toBe(3);
    expect(p.pct).toBe(0);
  });

  it('reports partial progress toward the next level', () => {
    const p = levelProgress(500);
    expect(p.level).toBe(3);
    expect(p.pointsIntoLevel).toBe(100);
    expect(p.pointsForNextLevel).toBe(500); // level 3 spans 400..900
    expect(p.pct).toBeCloseTo(0.2);
  });
});
