import { describe, it, expect } from 'vitest';
import { votedIds, UNSURE_SNOOZE_MS } from './pickFeedback';

describe('votedIds', () => {
  it('is empty with no feedback', () => {
    expect(votedIds({})).toEqual([]);
    expect(votedIds(null)).toEqual([]);
  });

  it('includes every landmark given a real ✓/✗ verdict, whichever way', () => {
    const feedback = {
      a: { landmarkId: 'a', verdict: 'yes' },
      b: { landmarkId: 'b', verdict: 'no' },
    };
    expect(votedIds(feedback).sort()).toEqual(['a', 'b']);
  });

  it('snoozes "not sure" for a week instead of blacklisting it', () => {
    const now = 1_000_000_000_000;
    const feedback = {
      a: { landmarkId: 'a', verdict: 'yes' },
      b: { landmarkId: 'b', verdict: 'unsure', at: now - 60 * 1000 },
      c: { landmarkId: 'c', verdict: 'unsure', at: now - UNSURE_SNOOZE_MS - 1 },
    };
    expect(votedIds(feedback, now).sort()).toEqual(['a', 'b']);
  });
});
