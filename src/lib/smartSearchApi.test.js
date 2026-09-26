import { describe, it, expect, vi, beforeEach } from 'vitest';

let modelReply = '';
let lastRequest = null;
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (req) => {
        lastRequest = req;
        return { content: [{ type: 'text', text: modelReply }] };
      },
    };
  },
}));
vi.mock('../../api/_lib/aiGuard.js', () => ({ guardAiRequest: async () => ({ uid: 'me' }) }));

import handler from '../../api/smart-search.js';
import { ALL_LANDMARKS } from '../data/regions';

const run = (body) =>
  new Promise((resolve) => {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(data) {
        resolve({ code: this.code, data });
      },
    };
    handler({ method: 'POST', body, headers: {} }, res);
  });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
  lastRequest = null;
});

describe('api/smart-search', () => {
  it('returns only ids that exist in the catalog or the sent items', async () => {
    const lm = ALL_LANDMARKS[0];
    modelReply = JSON.stringify({ ids: [`${lm.regionId}/${lm.id}`, 'made/up', 'c1', 'c9'] });
    const { data } = await run({ query: 'something vague', catalog: true, items: [{ id: 'c1', text: 'My check-in' }] });
    expect(data.ids).toEqual([`${lm.regionId}/${lm.id}`, 'c1']);
    expect(lastRequest.system.some((b) => b.cache_control)).toBe(true);
  });

  it('without the catalog, only the sent items count', async () => {
    const lm = ALL_LANDMARKS[0];
    modelReply = JSON.stringify({ ids: [`${lm.regionId}/${lm.id}`, 'c1'] });
    const { data } = await run({ query: 'something vague', items: [{ id: 'c1', text: 'My check-in' }] });
    expect(data.ids).toEqual(['c1']);
    expect(lastRequest.system).toHaveLength(1);
  });

  it('skips the AI for an empty query or nothing to search', async () => {
    expect((await run({ query: 'x', catalog: true })).data.ids).toEqual([]);
    expect((await run({ query: 'something', items: [] })).data.ids).toEqual([]);
    expect(lastRequest).toBeNull();
  });

  it('survives an unparseable reply', async () => {
    modelReply = 'sorry, no idea';
    expect((await run({ query: 'something', catalog: true })).data.ids).toEqual([]);
  });
});
