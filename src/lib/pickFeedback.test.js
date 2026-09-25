import { describe, it, expect } from 'vitest';
import { votedIds } from './pickFeedback';

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

  it('excludes "not sure" -- it is not a conclusive verdict, so it never blacklists the landmark', () => {
    const feedback = {
      a: { landmarkId: 'a', verdict: 'yes' },
      b: { landmarkId: 'b', verdict: 'unsure' },
    };
    expect(votedIds(feedback)).toEqual(['a']);
  });
});
