import { describe, expect, it } from 'vitest';
import { sortCheckins } from './checkinSort';

const items = [
  { id: 'a', name: 'Old park', createdAt: 100, rateable: true, stars: 3 },
  { id: 'b', name: 'Newest dorm', createdAt: 400, rateable: false, stars: null },
  { id: 'c', name: 'Unrated cafe', createdAt: 300, rateable: true, stars: null },
  { id: 'd', name: 'Loved museum', createdAt: 200, rateable: true, stars: 5 },
  { id: 'e', name: 'Skipped bar', createdAt: 250, rateable: true, stars: 1 },
];
const ids = (list) => list.map((x) => x.id);

describe('sortCheckins', () => {
  it('recent and oldest keep every check-in, dorms included', () => {
    expect(ids(sortCheckins(items, 'recent'))).toEqual(['b', 'c', 'e', 'd', 'a']);
    expect(ids(sortCheckins(items, 'oldest'))).toEqual(['a', 'd', 'e', 'c', 'b']);
  });

  it('highest rated drops unrateable spots and puts unrated at the bottom', () => {
    expect(ids(sortCheckins(items, 'top'))).toEqual(['d', 'a', 'e', 'c']);
  });

  it('lowest rated flips the rated order but still keeps unrated last', () => {
    expect(ids(sortCheckins(items, 'bottom'))).toEqual(['e', 'a', 'd', 'c']);
  });

  it('breaks ties on rating by most recent', () => {
    const tied = [
      { id: 'x', createdAt: 1, rateable: true, stars: 5 },
      { id: 'y', createdAt: 2, rateable: true, stars: 5 },
    ];
    expect(ids(sortCheckins(tied, 'top'))).toEqual(['y', 'x']);
  });
});
