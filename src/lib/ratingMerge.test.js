import { describe, it, expect } from 'vitest';
import { normalizeName, namesMatch } from './ratingMerge';

describe('normalizeName', () => {
  it('lowercases, strips parentheticals, and collapses punctuation', () => {
    expect(normalizeName('Oeschinensee (Lake Oeschinen)')).toBe('oeschinensee');
    expect(normalizeName('Le Duplex')).toBe('le duplex');
    expect(normalizeName('  Café-du-Nord!! ')).toBe('caf du nord');
  });

  it('handles empty/missing input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('namesMatch', () => {
  it('matches an exact name', () => {
    expect(namesMatch('Le Duplex', 'Le Duplex')).toBe(true);
  });

  it('matches when the catalog name adds a parenthetical the old name lacks', () => {
    expect(namesMatch('Oeschinensee (Lake Oeschinen)', 'Oeschinensee')).toBe(true);
    expect(namesMatch('Oeschinensee', 'Oeschinensee (Lake Oeschinen)')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(namesMatch('Le Duplex', 'Eiffel Tower')).toBe(false);
  });

  it('never matches when either name is missing', () => {
    expect(namesMatch('', 'Le Duplex')).toBe(false);
    expect(namesMatch('Le Duplex', undefined)).toBe(false);
  });
});
