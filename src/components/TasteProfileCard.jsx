import { useAuth } from '../lib/AuthContext';
import { useRatings } from '../lib/RatingsContext';
import { computeTasteConfidence, hasInsiderMode, INSIDER_MODE_CONFIDENCE } from '../lib/tasteProfile';

// Taste Profile Score -- Mapr's own leave-one-out prediction confidence
// (see computeTasteConfidence), NOT an activity counter. It only goes up
// when the model's affinity math actually starts guessing your ratings
// right from your OTHER ratings; a narrow or inconsistent rating history
// plateaus it, on purpose. Personal-only, never on any leaderboard.
export default function TasteProfileCard() {
  const { user } = useAuth();
  const { myReviews } = useRatings();
  if (!user) return null;

  const reviews = Object.values(myReviews).map((r) => ({
    tier: r.ratingTier,
    categories: r.categories || [],
    name: r.landmarkName,
    comment: r.comment || '',
    highlights: r.highlights || [],
    updatedAt: r.updatedAt,
  }));
  const { confidence, sampleCount } = computeTasteConfidence(reviews);
  const unlocked = hasInsiderMode(confidence);

  if (sampleCount < 2) {
    return (
      <div className="card section taste-profile-card">
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F9E9}'} Taste Profile</h3>
        <p className="screen-subtitle" style={{ margin: '6px 0 0' }}>
          Rate a couple more places and Mapr can start scoring how well it actually knows your taste.
        </p>
      </div>
    );
  }

  return (
    <div className="card section taste-profile-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F9E9}'} Taste Profile — {confidence}% confident</h3>
        {unlocked && (
          <span className="tag" style={{ fontSize: '0.65rem' }} title={`Unlocked at ${INSIDER_MODE_CONFIDENCE}% confidence`}>
            {'\u{1F511}'} Insider Mode
          </span>
        )}
      </div>
      <div
        className="level-bar-track"
        style={{ marginTop: 8 }}
        role="progressbar"
        aria-valuenow={confidence}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="level-bar-fill" style={{ width: `${confidence}%` }} />
      </div>
      <p className="screen-subtitle" style={{ margin: '6px 0 0' }}>
        {unlocked
          ? "Insider Mode is on — Mapr's chat leans toward lesser-known spots for you now."
          : 'How well Mapr can predict a rating of yours from your OTHER ratings alone. The more you rate — across different kinds of places — the higher this climbs.'}
      </p>
    </div>
  );
}
