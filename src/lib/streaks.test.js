import { describe, it, expect } from 'vitest';
import { computeStreakDays, computeBadges } from './streaks';

const sec = (isoDate) => Math.floor(new Date(isoDate).getTime() / 1000);
const checkin = (isoDate) => ({ createdAt: { seconds: sec(isoDate) } });

describe('computeStreakDays', () => {
  it('is zero with no check-ins', () => {
    expect(computeStreakDays([])).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const checkins = [checkin('2026-03-10T08:00:00Z'), checkin('2026-03-09T08:00:00Z'), checkin('2026-03-08T08:00:00Z')];
    expect(computeStreakDays(checkins, now)).toBe(3);
  });

  it('still counts through yesterday if today has no check-in yet', () => {
    const now = new Date('2026-03-10T23:00:00Z');
    const checkins = [checkin('2026-03-09T08:00:00Z'), checkin('2026-03-08T08:00:00Z')];
    expect(computeStreakDays(checkins, now)).toBe(2);
  });

  it('is broken by a gap', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const checkins = [checkin('2026-03-10T08:00:00Z'), checkin('2026-03-07T08:00:00Z')];
    expect(computeStreakDays(checkins, now)).toBe(1);
  });

  it('is zero if the most recent check-in was more than a day ago', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const checkins = [checkin('2026-03-05T08:00:00Z')];
    expect(computeStreakDays(checkins, now)).toBe(0);
  });

  it('counts multiple check-ins on the same day as one day', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const checkins = [checkin('2026-03-10T08:00:00Z'), checkin('2026-03-10T20:00:00Z')];
    expect(computeStreakDays(checkins, now)).toBe(1);
  });
});

describe('computeBadges', () => {
  it('awards nothing below every threshold', () => {
    expect(computeBadges({ checkinsCount: 0, citiesCount: 0, streakDays: 0 })).toEqual([]);
  });

  it('awards the right milestones for a strong run', () => {
    const badges = computeBadges({ checkinsCount: 10, citiesCount: 3, streakDays: 7 });
    const ids = badges.map((b) => b.id);
    expect(ids).toContain('checkins-1');
    expect(ids).toContain('checkins-5');
    expect(ids).toContain('checkins-10');
    expect(ids).not.toContain('checkins-25');
    expect(ids).toContain('cities-2');
    expect(ids).toContain('cities-3');
    expect(ids).toContain('streak-3');
    expect(ids).toContain('streak-7');
    expect(ids).not.toContain('streak-30');
  });
});
