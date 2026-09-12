import { describe, it, expect } from 'vitest';
import { getChallengesForRegion, getFeaturedChallenge } from './challenges';

describe('getChallengesForRegion', () => {
  it('only returns collections with at least two landmarks', () => {
    for (const c of getChallengesForRegion('miami')) {
      expect(c.landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is empty for a region with no landmarks', () => {
    expect(getChallengesForRegion('not-a-real-region')).toEqual([]);
  });
});

describe('getFeaturedChallenge', () => {
  it('picks the same challenge for two dates in the same ISO week', () => {
    const a = getFeaturedChallenge('miami', new Date('2026-03-02T00:00:00Z')); // Monday
    const b = getFeaturedChallenge('miami', new Date('2026-03-08T23:00:00Z')); // Sunday, same week
    expect(a?.id).toBe(b?.id);
  });

  it('is null for a region with no eligible challenges', () => {
    expect(getFeaturedChallenge('not-a-real-region')).toBeNull();
  });
});
