import { describe, it, expect } from 'vitest';
import { formatDistance } from './UnitsContext';

describe('formatDistance', () => {
  it('formats metric under 1km in meters', () => {
    expect(formatDistance(250, 'metric')).toBe('250 m');
  });

  it('formats metric at or above 1km in km', () => {
    expect(formatDistance(1500, 'metric')).toBe('1.5 km');
  });

  it('formats imperial under ~0.19mi in feet', () => {
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
  });

  it('formats imperial at or above 1000ft in miles', () => {
    expect(formatDistance(1609.34, 'imperial')).toBe('1.0 mi');
  });
});
