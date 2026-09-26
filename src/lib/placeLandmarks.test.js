import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase', () => ({ auth: null, db: null }));
vi.mock('./customLandmarks', () => ({
  getCustomLandmarks: vi.fn(async () => [
    { id: 'c1', name: 'Philly Gun Range', region: 'philly', lat: 39.95, lng: -75.16, categories: [] },
  ]),
  addCustomLandmark: vi.fn(),
}));
vi.mock('./places', () => ({
  makeSessionToken: () => 't',
  searchPlaces: vi.fn(async () => [{ placeId: 'p1', primary: 'Range 2' }]),
  getPlaceDetails: vi.fn(async () => ({ primary: 'Range 2', lat: 39.9501, lng: -75.1601 })),
}));

import { landmarkForRating } from './placeLandmarks';
import { searchPlaces } from './places';
import { ALL_LANDMARKS } from '../data/regions';

const ctx = { near: { lat: 39.95, lng: -75.16 }, user: { uid: 'me' }, resendVerification: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('landmarkForRating', () => {
  it('returns a catalog landmark directly from its region/id', async () => {
    const lm = ALL_LANDMARKS[0];
    const got = await landmarkForRating({ region: lm.regionId, id: lm.id, name: lm.name }, ctx);
    expect(got.id).toBe(lm.id);
    expect(got.regionId).toBe(lm.regionId);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('matches a place someone already added by name, ignoring case and punctuation', async () => {
    const got = await landmarkForRating({ name: 'philly gun-range', address: '' }, ctx);
    expect(got.id).toBe('c1');
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('reuses an added place at the same spot Google points to, instead of adding a duplicate', async () => {
    const got = await landmarkForRating({ name: 'Some Other Name', address: '1 Range Rd' }, ctx);
    expect(searchPlaces).toHaveBeenCalled();
    expect(got.id).toBe('c1');
  });
});
