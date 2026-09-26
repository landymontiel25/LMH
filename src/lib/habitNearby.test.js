import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./apiAuth', () => ({ authHeaders: vi.fn(async () => ({ Authorization: 'Bearer t' })) }));
vi.mock('./tasteQuestions', () => ({ composeTasteIntro: vi.fn(() => 'loves shooting ranges') }));

import { findRelatedStop } from './habitNearby';

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = {
  coords: { lat: 40.7128, lng: -74.006 },
  placeName: 'Dunkin Donuts',
  myProfile: { tasteIntro: 'loves shooting ranges' },
  savedInterests: ['shooting'],
  regionId: 'nyc',
};

describe('findRelatedStop', () => {
  it('returns the first stop plan-ai suggests, sending the habit place as a synthetic message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "There's a range nearby.",
        stops: [{ external: true, name: 'City Gun Range', address: '1 Range Rd', url: 'https://example.com', reason: 'You love shooting.' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stop = await findRelatedStop(args);
    expect(stop.name).toBe('City Gun Range');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('Dunkin Donuts');
    expect(body.regionIds).toEqual(['nyc']);
    expect(body.interests).toEqual(['shooting']);
    expect(body.location).toEqual({ lat: 40.7128, lng: -74.006, label: 'Dunkin Donuts' });
  });

  it('returns null when plan-ai has no good match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: 'Nothing comes to mind.', stops: [] }) })
    );
    expect(await findRelatedStop(args)).toBeNull();
  });

  it('returns null instead of throwing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await findRelatedStop(args)).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'oops' }) }));
    expect(await findRelatedStop(args)).toBeNull();
  });
});
