import { describe, it, expect } from 'vitest';
import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('matches a plain single-word query as a substring', () => {
    expect(matchesSearch('Miami International Autodrome', 'autodrome')).toBe(true);
    expect(matchesSearch('Miami International Autodrome', 'monza')).toBe(false);
  });

  it('matches every word in a multi-word query regardless of order or adjacency', () => {
    const haystack = 'Miami International Autodrome miami formula 1 circuit f1 miami grand prix';
    expect(matchesSearch(haystack, 'miami f1')).toBe(true);
    expect(matchesSearch(haystack, 'f1 miami')).toBe(true);
  });

  it('requires ALL words to be present, not just any', () => {
    expect(matchesSearch('Eiffel Tower Paris', 'eiffel monza')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesSearch('Miami International Autodrome', 'MIAMI autodrome')).toBe(true);
  });

  it('treats an empty or whitespace query as matching everything', () => {
    expect(matchesSearch('anything', '')).toBe(true);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  it('handles missing haystack without throwing', () => {
    expect(matchesSearch(null, 'x')).toBe(false);
    expect(matchesSearch(undefined, '')).toBe(true);
  });
});
