import { describe, expect, it } from 'vitest';
import { picksCacheKey } from './maprPicks';

describe('picksCacheKey', () => {
  it('changes when the taste fingerprint changes, even with the same ratingsCount/location', () => {
    const origin = { lat: 40.7128, lng: -74.006 };
    const keyA = picksCacheKey('uid1', 5, origin, 'fp-before');
    const keyB = picksCacheKey('uid1', 5, origin, 'fp-after');
    expect(keyA).not.toBe(keyB);
  });

  it('defaults to an empty fingerprint when none is given, for callers that predate it', () => {
    expect(() => picksCacheKey('uid1', 0, null)).not.toThrow();
  });
});
