import { getLandmark } from '../data/regions';
import { categoryLabel, chipLabel, TASTE_CARD_MIN_RATINGS } from '../lib/ratingFlow';

function topN(counts, n) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

// "You tend to love: historic sites, local food" -- built from the user's
// own ratings and shown back to them as the payoff for rating. Categories
// come from the landmarks they marked Highly recommend; the second line is
// the chips they tap most. Hidden until there's enough to say something.
export default function ProfileTasteCard({ reviews }) {
  if (!reviews || reviews.length < TASTE_CARD_MIN_RATINGS) return null;

  const catCounts = {};
  const chipCounts = {};
  for (const r of reviews) {
    // Old reviews (pre-tier) have stars but no tier -- 4+ stars counts as loved.
    const loved = r.ratingTier ? r.ratingTier === 'highly-recommend' : (r.stars || 0) >= 4;
    if (loved) {
      const cats = r.categories?.length ? r.categories : getLandmark(r.region, r.landmarkId)?.categories || [];
      for (const c of cats) catCounts[c] = (catCounts[c] || 0) + 1;
    }
    for (const h of r.highlights || []) chipCounts[h] = (chipCounts[h] || 0) + 1;
  }

  const cats = topN(catCounts, 2);
  const chips = topN(chipCounts, 2);
  if (!cats.length && !chips.length) return null;

  return (
    <div className="taste-card">
      <div className="taste-card-title">{'\u{1F9ED}'} Your taste, so far</div>
      {cats.length > 0 && (
        <p className="taste-card-line">
          You tend to love <strong>{cats.map(categoryLabel).join(' and ')}</strong>.
        </p>
      )}
      {chips.length > 0 && (
        <p className="taste-card-line">
          Most often: <strong>{chips.map(chipLabel).join(', ')}</strong>.
        </p>
      )}
      <p className="taste-card-note">Mapr uses this to pick places for you.</p>
    </div>
  );
}
