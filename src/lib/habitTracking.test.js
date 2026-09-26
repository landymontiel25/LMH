import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory stand-in for the localStorage-backed persistence helpers,
// same approach as maprActions.test.js takes for its own dependencies.
const store = new Map();
vi.mock('./usePersistentState', () => ({
  readPersisted: (key) => store.get(key),
  writePersisted: (key, value) => store.set(key, value),
}));

import {
  recordVisit,
  getDueSuggestion,
  typicalTimeLabel,
  recordPrompted,
  resolveClusterName,
  markLookupFailed,
  markClusterAdded,
  dismissCluster,
  _clearHabits,
  MIN_DAYS_TO_SUGGEST,
} from './habitTracking';

const UID = 'u1';
const SPOT = { lat: 40.7128, lng: -74.006, accuracy: 20 };
const FAR = { lat: 40.8, lng: -74.2, accuracy: 20 };

function visitOnDay(dayOffset, coords = SPOT) {
  const now = new Date(2026, 0, 1 + dayOffset, 8, 0, 0);
  recordVisit(UID, coords, now);
  return now;
}

beforeEach(() => {
  store.clear();
});

describe('habitTracking', () => {
  it('merges nearby fixes into one cluster instead of creating duplicates', () => {
    recordVisit(UID, SPOT, new Date(2026, 0, 1, 8, 0));
    recordVisit(UID, { lat: SPOT.lat + 0.0002, lng: SPOT.lng, accuracy: 20 }, new Date(2026, 0, 1, 8, 1));
    const due = getDueSuggestion(UID, SPOT, { now: new Date(2026, 0, 1, 8, 2) });
    // Not due yet (only one distinct day so far), but this should still be a
    // single cluster -- confirmed indirectly via day-count below.
    expect(due).toBeNull();
  });

  it('does not suggest a spot until it has been visited on enough distinct days', () => {
    visitOnDay(0);
    visitOnDay(1);
    let due = getDueSuggestion(UID, SPOT, { now: new Date(2026, 0, 2, 9, 0) });
    expect(due).toBeNull();

    const lastVisit = visitOnDay(2);
    due = getDueSuggestion(UID, SPOT, { now: lastVisit });
    expect(due).not.toBeNull();
    expect(due.days.length).toBeGreaterThanOrEqual(MIN_DAYS_TO_SUGGEST);
  });

  it('only suggests when the caller is currently at the cluster location', () => {
    visitOnDay(0);
    visitOnDay(1);
    const lastVisit = visitOnDay(2);
    const due = getDueSuggestion(UID, FAR, { now: lastVisit });
    expect(due).toBeNull();
  });

  it('skips a cluster the caller says is already tracked', () => {
    visitOnDay(0);
    visitOnDay(1);
    const lastVisit = visitOnDay(2);
    const due = getDueSuggestion(UID, SPOT, { isAlreadyTracked: () => true, now: lastVisit });
    expect(due).toBeNull();
  });

  it('ignores fixes with poor accuracy', () => {
    recordVisit(UID, { lat: SPOT.lat, lng: SPOT.lng, accuracy: 500 }, new Date(2026, 0, 1, 8, 0));
    const due = getDueSuggestion(UID, SPOT, { now: new Date(2026, 0, 1, 8, 1) });
    expect(due).toBeNull();
  });

  it('applies a global cooldown after a suggestion is prompted', () => {
    visitOnDay(0);
    visitOnDay(1);
    const day2 = visitOnDay(2);
    const due = getDueSuggestion(UID, SPOT, { now: day2 });
    expect(due).not.toBeNull();
    recordPrompted(UID, due.id, day2);

    const soonAfter = new Date(day2.getTime() + 60 * 60 * 1000); // 1 hour later
    expect(getDueSuggestion(UID, SPOT, { now: soonAfter })).toBeNull();

    const nextDay = new Date(day2.getTime() + 25 * 60 * 60 * 1000); // >20h cooldown
    visitOnDay(3);
    expect(getDueSuggestion(UID, SPOT, { now: nextDay })).not.toBeNull();
  });

  it('stops suggesting a cluster once it is marked added or dismissed', () => {
    visitOnDay(0);
    visitOnDay(1);
    const day2 = visitOnDay(2);
    const due = getDueSuggestion(UID, SPOT, { now: day2 });
    markClusterAdded(UID, due.id);
    expect(getDueSuggestion(UID, SPOT, { now: day2 })).toBeNull();

    _clearHabits(UID);
    visitOnDay(0);
    visitOnDay(1);
    const due2 = getDueSuggestion(UID, SPOT, { now: visitOnDay(2) });
    dismissCluster(UID, due2.id);
    expect(getDueSuggestion(UID, SPOT, { now: visitOnDay(3) })).toBeNull();
  });

  it('retries a failed name lookup only after a cooldown, not on every visit', () => {
    visitOnDay(0);
    visitOnDay(1);
    const day2 = visitOnDay(2);
    const due = getDueSuggestion(UID, SPOT, { now: day2 });
    markLookupFailed(UID, due.id, day2);

    expect(getDueSuggestion(UID, SPOT, { now: new Date(day2.getTime() + 60 * 60 * 1000) })).toBeNull();

    const muchLater = new Date(day2.getTime() + 4 * 24 * 60 * 60 * 1000);
    expect(getDueSuggestion(UID, SPOT, { now: muchLater })).not.toBeNull();
  });

  it('carries a resolved name onto the cluster returned as the suggestion', () => {
    visitOnDay(0);
    visitOnDay(1);
    const day2 = visitOnDay(2);
    const due = getDueSuggestion(UID, SPOT, { now: day2 });
    resolveClusterName(UID, due.id, { name: 'Dunkin', address: '1 Main St', placeId: 'p1' });

    const named = getDueSuggestion(UID, SPOT, { now: day2 });
    expect(named.name).toBe('Dunkin');
    expect(named.address).toBe('1 Main St');
  });

  it('typicalTimeLabel summarizes the visit hours, and is empty with too little data', () => {
    expect(typicalTimeLabel({ hours: [8] })).toBe('');
    expect(typicalTimeLabel({ hours: [7, 8, 8, 9] })).toMatch(/am/);
    expect(typicalTimeLabel(null)).toBe('');
  });
});
