import { getLandmark } from '../data/regions';
import { categoryLabel, chipLabel, TASTE_CARD_MIN_RATINGS } from '../lib/ratingFlow';

function topN(counts, n) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

// "You loved Golden Gate Bridge and Ferry Building -- mostly for the view
// and the atmosphere" -- built from the user's own ratings and shown back
// to them as the payoff for rating. Names two actual places they rated
// highly, plus the chip they tap most, rather than only naming a broad
// category ("History & Culture") -- a category alone reads as generic and
// doesn't feel like it's actually about *you*, since two people who both
// "love history" can want completely different things out of a visit.
// Also names what they tend to skip, when there's enough of a pattern to
// say so, since a taste profile that only ever says nice things isn't
// telling the whole story Mapr is using to pick for them. Hidden until
// there's enough to say something.
export default function ProfileTasteCard({ reviews }) {
  if (!reviews || reviews.length < TASTE_CARD_MIN_RATINGS) return null;

  const loved = [];
  const skipped = [];
  const chipCounts = {};
  const skippedCatCounts = {};
  for (const r of reviews) {
    // Old reviews (pre-tier) have stars but no tier -- 4+ stars counts as loved.
    const isLoved = r.ratingTier ? r.ratingTier === 'highly-recommend' : (r.stars || 0) >= 4;
    const isSkipped = r.ratingTier === 'probably-skip';
    if (isLoved) {
      loved.push(r);
      for (const h of r.highlights || []) chipCounts[h] = (chipCounts[h] || 0) + 1;
    } else if (isSkipped) {
      skipped.push(r);
      const cats = r.categories?.length ? r.categories : getLandmark(r.region, r.landmarkId)?.categories || [];
      for (const c of cats) skippedCatCounts[c] = (skippedCatCounts[c] || 0) + 1;
    }
  }

  const lovedNames = loved
    .map((r) => r.landmarkName)
    .filter(Boolean)
    .slice(0, 2);
  const chips = topN(chipCounts, 2);
  // Only worth naming a "you tend to skip" pattern once it's shown up more
  // than once -- a single so-so visit isn't a taste signal.
  const skippedCats = Object.entries(skippedCatCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([id]) => id);

  if (!lovedNames.length && !skippedCats.length) return null;

  return (
    <div className="taste-card">
      <div className="taste-card-title">{'\u{1F9ED}'} Your taste, so far</div>
      {lovedNames.length > 0 && (
        <p className="taste-card-line">
          You loved <strong>{lovedNames.join(' and ')}</strong>
          {loved.length > lovedNames.length ? `, and ${loved.length - lovedNames.length} more` : ''}.
        </p>
      )}
      {chips.length > 0 && (
        <p className="taste-card-line">
          Mostly for the <strong>{chips.map(chipLabel).join(' and ')}</strong>.
        </p>
      )}
      {skippedCats.length > 0 && (
        <p className="taste-card-line">
          You tend to skip <strong>{skippedCats.map(categoryLabel).join(' and ')}</strong>.
        </p>
      )}
      <p className="taste-card-note">Mapr uses this to pick places for you.</p>
    </div>
  );
}
