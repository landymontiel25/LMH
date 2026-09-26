import { describe, it, expect, afterEach, vi } from 'vitest';
import { friendlyError, fetchJson, OFFLINE_MESSAGE } from './friendlyError';

afterEach(() => vi.unstubAllGlobals());

describe('friendlyError', () => {
  it('maps Firebase codes to plain language', () => {
    expect(friendlyError({ code: 'unavailable' })).toMatch(/Can't reach the server/);
    expect(friendlyError({ code: 'permission-denied' })).toMatch(/permission/);
  });

  it('prefers the server-written message from our own API', () => {
    expect(friendlyError({ userMessage: 'Sign in to use the AI features.', status: 401 })).toBe(
      'Sign in to use the AI features.'
    );
  });

  it('maps HTTP status when there is no server message', () => {
    expect(friendlyError({ status: 503 })).toMatch(/temporarily unavailable/);
  });

  it('turns a failed fetch into a connection message', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/connection/);
  });

  it('never leaks raw backend text', () => {
    expect(friendlyError(new Error('FirebaseError: [code=internal] stack trace'))).toBe('Something went wrong. Try again.');
  });

  it('says offline when the device is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(friendlyError({ code: 'unavailable' })).toBe(OFFLINE_MESSAGE);
  });
});

describe('fetchJson', () => {
  it('throws with status and the server message', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, json: async () => ({ error: 'Slow down.' }) }));
    await expect(fetchJson('/api/x')).rejects.toMatchObject({ status: 429, userMessage: 'Slow down.' });
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ a: 1 }) }));
    await expect(fetchJson('/api/x')).resolves.toEqual({ a: 1 });
  });
});
