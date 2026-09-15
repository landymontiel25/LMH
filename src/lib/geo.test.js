import { describe, it, expect } from 'vitest';
import { distanceMeters, nearestRegionId } from './geo';
import { REGIONS } from '../data/regions';

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it('matches a known real-world distance within a small tolerance', () => {
    // Miami (25.7617, -80.1918) to Fort Lauderdale (26.1224, -80.1373) is
    // roughly 42km as the crow flies.
    const d = distanceMeters(25.7617, -80.1918, 26.1224, -80.1373);
    expect(d).toBeGreaterThan(40_000);
    expect(d).toBeLessThan(44_000);
  });

  it('is symmetric', () => {
    const a = distanceMeters(41.9, 12.5, 45.46, 9.19);
    const b = distanceMeters(45.46, 9.19, 41.9, 12.5);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('nearestRegionId', () => {
  it('picks the region whose own center is the nearest match', () => {
    // A region's own center point must resolve to that region -- otherwise
    // the "which city is this near" logic used when filing a new landmark
    // submission is broken for the most obvious case there is.
    for (const region of REGIONS) {
      if (region.worldwide) continue;
      expect(nearestRegionId(region.center.lat, region.center.lng)).toBe(region.id);
    }
  });

  it('never files a point under a worldwide catalog region', () => {
    const catalog = REGIONS.find((r) => r.worldwide);
    expect(catalog).toBeTruthy();
    // Silverstone is the catalog's own center; a real city must still win.
    expect(nearestRegionId(catalog.center.lat, catalog.center.lng)).not.toBe(catalog.id);
  });
});
