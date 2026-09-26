import { describe, it, expect } from 'vitest';
import { itineraryPhase, isAllVisited, groupKey } from './itineraryStatus';

describe('itineraryPhase', () => {
  it('is past once every landmark is checked into, current before that', () => {
    expect(itineraryPhase('philly', ['a', 'b'], { a: true }, {})).toBe('current');
    expect(itineraryPhase('philly', ['a', 'b'], { a: true, b: true }, {})).toBe('past');
  });

  it('never auto-moves an itinerary with no catalog landmarks', () => {
    expect(isAllVisited([], {})).toBe(false);
    expect(itineraryPhase('philly', [], {}, {})).toBe('current');
  });

  it('a manual move wins either way', () => {
    expect(itineraryPhase('philly', ['a'], {}, { philly: 'past' })).toBe('past');
    expect(itineraryPhase('philly', ['a'], { a: true }, { philly: 'current' })).toBe('current');
    expect(itineraryPhase(groupKey('g1'), ['a'], {}, { 'group:g1': 'past' })).toBe('past');
  });
});
