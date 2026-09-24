import { describe, it, expect } from 'vitest';
import { regionTimezone, tzAbbrev, toZonedInputValue, fromZonedInputValue } from './timezones';

describe('regionTimezone', () => {
  it('maps known regions to their real IANA timezone', () => {
    expect(regionTimezone('miami')).toBe('America/New_York');
    expect(regionTimezone('san-francisco')).toBe('America/Los_Angeles');
    expect(regionTimezone('switzerland')).toBe('Europe/Zurich');
    expect(regionTimezone('frankfurt')).toBe('Europe/Berlin');
  });

  it('falls back to the browser timezone for an unknown region', () => {
    expect(regionTimezone('nowhere')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('tzAbbrev', () => {
  it('gives a short, DST-aware label', () => {
    // Jan 1 is standard time in the US -- EST, not EDT.
    expect(tzAbbrev('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('EST');
    // July is daylight time.
    expect(tzAbbrev('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe('EDT');
  });
});

describe('toZonedInputValue / fromZonedInputValue round-trip', () => {
  it('reads a known UTC instant as the correct Miami wall-clock time', () => {
    // 2026-07-15 12:00 UTC is 08:00 EDT (UTC-4) in Miami.
    const seconds = Date.UTC(2026, 6, 15, 12, 0) / 1000;
    expect(toZonedInputValue(seconds, 'America/New_York')).toBe('2026-07-15T08:00');
  });

  it('converts a Miami wall-clock string back to the correct UTC instant', () => {
    const date = fromZonedInputValue('2026-07-15T08:00', 'America/New_York');
    expect(date.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('round-trips through winter (standard time, UTC-5) too', () => {
    const value = '2026-01-15T09:30';
    const date = fromZonedInputValue(value, 'America/New_York');
    expect(toZonedInputValue(Math.floor(date.getTime() / 1000), 'America/New_York')).toBe(value);
  });

  it('round-trips for a non-US zone (Switzerland, UTC+1/+2)', () => {
    const value = '2026-08-01T14:15';
    const date = fromZonedInputValue(value, 'Europe/Zurich');
    expect(toZonedInputValue(Math.floor(date.getTime() / 1000), 'Europe/Zurich')).toBe(value);
  });

  it('returns an empty string for a falsy seconds value', () => {
    expect(toZonedInputValue(0, 'America/New_York')).toBe('');
    expect(toZonedInputValue(null, 'America/New_York')).toBe('');
  });
});
