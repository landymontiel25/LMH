import { describe, it, expect } from 'vitest';
import { baselineToSentence, baselineToSyntheticReviews, composeTasteIntro } from './tasteQuestions';

describe('baselineToSentence', () => {
  it('returns empty string for no baseline', () => {
    expect(baselineToSentence(null)).toBe('');
    expect(baselineToSentence({})).toBe('');
  });

  it('lists likes and dislikes per category', () => {
    const sentence = baselineToSentence({
      food: { Steak: 'like', Sushi: 'dislike' },
      'parks-nature': { 'Hiking trails': 'like' },
    });
    expect(sentence).toContain('Food: likes Steak; dislikes Sushi');
    expect(sentence).toContain('Parks & Nature: likes Hiking trails');
  });

  it('skips a category with no picks left in it', () => {
    expect(baselineToSentence({ food: {} })).toBe('');
  });
});

describe('baselineToSyntheticReviews', () => {
  it('returns no reviews for an empty baseline', () => {
    expect(baselineToSyntheticReviews(null)).toEqual([]);
    expect(baselineToSyntheticReviews({})).toEqual([]);
  });

  it('turns a like into a highly-recommend and a dislike into a probably-skip, at the category level', () => {
    const reviews = baselineToSyntheticReviews({ food: { Steak: 'like', Sushi: 'dislike' } });
    expect(reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: 'highly-recommend', categories: ['food'], name: 'Steak' }),
        expect.objectContaining({ tier: 'probably-skip', categories: ['food'], name: 'Sushi' }),
      ])
    );
    expect(reviews).toHaveLength(2);
  });
});

describe('composeTasteIntro', () => {
  it('combines free-text intro, baseline, and notes into one string', () => {
    const myProfile = {
      tasteIntro: 'I love racing and steak.',
      tasteBaseline: { food: { Steak: 'like' } },
      tasteBaselineNotes: 'No pepper on my steak.',
    };
    const combined = composeTasteIntro(myProfile);
    expect(combined).toContain('I love racing and steak.');
    expect(combined).toContain('Food: likes Steak');
    expect(combined).toContain('No pepper on my steak.');
  });

  it('handles a completely empty profile without throwing', () => {
    expect(composeTasteIntro(null)).toBe('');
    expect(composeTasteIntro({})).toBe('');
  });
});
