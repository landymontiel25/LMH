import { describe, it, expect } from 'vitest';
import { computeTasteConfidence, hasInsiderMode, INSIDER_MODE_CONFIDENCE } from './tasteProfile';

const review = (tier, categories, overrides = {}) => ({
  tier,
  categories,
  name: overrides.name || 'Some Place',
  comment: overrides.comment || '',
  highlights: overrides.highlights || [],
  updatedAt: overrides.updatedAt,
});

describe('computeTasteConfidence', () => {
  it('has no signal with fewer than 2 rated reviews', () => {
    expect(computeTasteConfidence([]).confidence).toBe(0);
    expect(computeTasteConfidence([review('highly-recommend', ['food'])]).confidence).toBe(0);
    expect(computeTasteConfidence([review('highly-recommend', ['food'])]).sampleCount).toBe(0);
  });

  it('ignores reviews with no tier', () => {
    const reviews = [{ categories: ['food'] }, { categories: ['food'] }];
    expect(computeTasteConfidence(reviews).sampleCount).toBe(0);
  });

  it('caps confidence low for a single-category history even if internally consistent', () => {
    // Every rating agrees (all loved, one category) -- leave-one-out
    // predictions should be accurate, but confidence still plateaus low
    // because category diversity is 1, well under the 4 needed for full
    // confidence.
    const reviews = Array.from({ length: 6 }, (_, i) => review('highly-recommend', ['food'], { name: `Place ${i}` }));
    const result = computeTasteConfidence(reviews);
    expect(result.categoryDiversity).toBe(1);
    expect(result.confidence).toBeLessThanOrEqual(25);
  });

  it('scores higher for a consistent taste spread across several categories than for a scattershot one', () => {
    const consistent = [
      review('highly-recommend', ['food']),
      review('highly-recommend', ['food']),
      review('highly-recommend', ['history-culture']),
      review('highly-recommend', ['history-culture']),
      review('probably-skip', ['parks-nature']),
      review('probably-skip', ['parks-nature']),
      review('worth-trying', ['entertainment']),
      review('worth-trying', ['entertainment']),
    ];
    const scattered = [
      review('highly-recommend', ['food']),
      review('probably-skip', ['food']),
      review('highly-recommend', ['history-culture']),
      review('probably-skip', ['history-culture']),
      review('highly-recommend', ['parks-nature']),
      review('probably-skip', ['parks-nature']),
      review('highly-recommend', ['entertainment']),
      review('probably-skip', ['entertainment']),
    ];
    const consistentResult = computeTasteConfidence(consistent);
    const scatteredResult = computeTasteConfidence(scattered);
    expect(consistentResult.confidence).toBeGreaterThan(scatteredResult.confidence);
  });

  it('never returns a negative confidence or one above 100', () => {
    const reviews = [
      review('highly-recommend', ['food']),
      review('probably-skip', ['food']),
      review('highly-recommend', ['history-culture']),
      review('probably-skip', ['history-culture']),
    ];
    const { confidence } = computeTasteConfidence(reviews);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
  });
});

describe('hasInsiderMode', () => {
  it('is locked below the confidence threshold', () => {
    expect(hasInsiderMode(INSIDER_MODE_CONFIDENCE - 1)).toBe(false);
  });

  it('unlocks at the confidence threshold', () => {
    expect(hasInsiderMode(INSIDER_MODE_CONFIDENCE)).toBe(true);
  });
});
