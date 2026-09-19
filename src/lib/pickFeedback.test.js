import { describe, it, expect } from 'vitest';
import { votedIds } from './pickFeedback';

describe('votedIds', () => {
  it('is empty with no feedback', () => {
    expect(votedIds({})).toEqual([]);
    expect(votedIds(null)).toEqual([]);
  });

  it('includes every landmark voted on, whichever way', () => {
    const feedback = {
      a: { landmarkId: 'a', verdict: 'yes' },
      b: { landmarkId: 'b', verdict: 'no' },
    };
    expect(votedIds(feedback).sort()).toEqual(['a', 'b']);
  });
});
