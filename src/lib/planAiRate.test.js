import { describe, it, expect, vi, beforeEach } from 'vitest';

// The model's raw JSON reply for each test; plan-ai parses and validates it.
let modelReply = '';
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: modelReply }], usage: {} }),
    };
  },
}));
vi.mock('../../api/_lib/aiGuard.js', () => ({ guardAiRequest: async () => ({ uid: 'me' }) }));

import handler from '../../api/plan-ai.js';
import { ALL_LANDMARKS } from '../data/regions';

const run = () =>
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
    handler({ method: 'POST', body: { messages: [{ role: 'user', content: 'I just left the shooting range' }] }, headers: {} }, res);
  });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
});

describe('plan-ai "rate" (a place you just left)', () => {
  it('passes a web place through by name and address', async () => {
    modelReply = JSON.stringify({
      reply: 'How was the range?',
      stops: [],
      rate: { name: 'Philly Gun Range', address: '1 Range Rd, Philadelphia' },
    });
    const { data } = await run();
    expect(data.rate).toEqual({ name: 'Philly Gun Range', address: '1 Range Rd, Philadelphia' });
  });

  it('resolves a catalog match to its region, id and real name', async () => {
    const lm = ALL_LANDMARKS[0];
    modelReply = JSON.stringify({ reply: 'How was it?', stops: [], rate: { match: `${lm.regionId}/${lm.id}` } });
    const { data } = await run();
    expect(data.rate).toEqual({ region: lm.regionId, id: lm.id, name: lm.name });
  });

  it('is null when the model sets nothing, or an unusable value', async () => {
    modelReply = JSON.stringify({ reply: 'Sure!', stops: [] });
    expect((await run()).data.rate).toBeNull();
    modelReply = JSON.stringify({ reply: 'Sure!', stops: [], rate: { match: 'nowhere/fake' } });
    expect((await run()).data.rate).toBeNull();
  });
});
