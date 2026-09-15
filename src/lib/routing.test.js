import { describe, it, expect } from 'vitest';
import { SORT_OPTIONS, orderStops, annotateRoute, estimateTravelMinutes } from './routing';

// Origin at (0,0); stops laid out on a line so straight-line distances are
// unambiguous: A is 1km away, B 2km, C 3km, D 4km.
const origin = { lat: 0, lng: 0 };
const km = 1 / 111.32; // ~1km of latitude
const A = { id: 'a', name: 'A', lat: 1 * km, lng: 0, typicalMinutes: 60, free: false };
const B = { id: 'b', name: 'B', lat: 2 * km, lng: 0, typicalMinutes: 15, free: true };
const C = { id: 'c', name: 'C', lat: 3 * km, lng: 0, typicalMinutes: 45, free: false };
const D = { id: 'd', name: 'D', lat: 4 * km, lng: 0, typicalMinutes: 30, free: true };
const shuffled = [C, A, D, B];
const ids = (list) => list.map((l) => l.id);

describe('SORT_OPTIONS', () => {
  it('leads with nearest-to-me as the default', () => {
    expect(SORT_OPTIONS[0].id).toBe('nearest');
    expect(new Set(SORT_OPTIONS.map((o) => o.id)).size).toBe(SORT_OPTIONS.length);
  });
});

describe('orderStops', () => {
  it('nearest: closest to you first, regardless of input order', () => {
    expect(ids(orderStops('nearest', origin, shuffled))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('falls back to nearest for an unknown sort id', () => {
    expect(ids(orderStops('bogus', origin, shuffled))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('route: a nearest-neighbor chain from you', () => {
    // On a line from the origin this is the same as nearest -- the point is
    // that it comes back annotated and in a walkable order.
    const out = orderStops('route', origin, shuffled);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd']);
    expect(out[1].distanceFromPrevMeters).toBeGreaterThan(0);
  });

  it('rated: by average, then count, rated before unrated, nearest as tiebreak', () => {
    const ratings = {
      c: { avg: 4.8, count: 12 },
      d: { avg: 4.8, count: 3 },
      a: { avg: 3.1, count: 40 },
      // b unrated
    };
    expect(ids(orderStops('rated', origin, shuffled, ratings))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('quick: shortest typical visit first', () => {
    expect(ids(orderStops('quick', origin, shuffled))).toEqual(['b', 'd', 'c', 'a']);
  });

  it('free: free places first, nearest within each group', () => {
    expect(ids(orderStops('free', origin, shuffled))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('never mutates the input', () => {
    const input = [C, A, D, B];
    orderStops('nearest', origin, input);
    expect(ids(input)).toEqual(['c', 'a', 'd', 'b']);
  });
});

describe('annotateRoute', () => {
  it('measures each leg from the previous stop, the first from the origin', () => {
    const out = annotateRoute(origin, [A, B, D]);
    expect(out[0].distanceFromPrevMeters).toBeCloseTo(1000, -2);
    expect(out[1].distanceFromPrevMeters).toBeCloseTo(1000, -2); // A -> B
    expect(out[2].distanceFromPrevMeters).toBeCloseTo(2000, -2); // B -> D
    for (const s of out) expect(s.travelMinutesFromPrev).toBe(estimateTravelMinutes(s.distanceFromPrevMeters));
  });

  it('keeps every field on the stop', () => {
    const [a] = annotateRoute(origin, [A]);
    expect(a).toMatchObject({ id: 'a', name: 'A', typicalMinutes: 60, free: false });
  });
});
