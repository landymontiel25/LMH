import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useRatings } from '../lib/RatingsContext';
import { computeTasteConfidence, hasInsiderMode, INSIDER_MODE_CONFIDENCE } from '../lib/tasteProfile';
import { baselineToSyntheticReviews } from '../lib/tasteQuestions';
import TasteNudgeCard from './TasteNudgeCard';

// Taste Profile Score -- Mapr's own leave-one-out prediction confidence
// (see computeTasteConfidence), NOT an activity counter. It only goes up
// when the model's affinity math actually starts guessing your ratings
// right from your OTHER ratings; a narrow or inconsistent rating history
// plateaus it, on purpose. Personal-only, never on any leaderboard. Real
// landmark ratings AND the taste baseline (TasteNudgeCard's like/dislike
// picks, turned into synthetic category-level "ratings" by
// baselineToSyntheticReviews) both feed it, so answering the baseline
// questions moves this score too, not just the free-text profile the AI
// reads.
export default function TasteProfileCard() {
  const { user } = useAuth();
  const { myProfile, reload: reloadFriends } = useFriends();
  const { myReviews } = useRatings();
  const [editing, setEditing] = useState(false);
  if (!user) return null;

  const reviews = [
    ...Object.values(myReviews).map((r) => ({
      tier: r.ratingTier,
      categories: r.categories || [],
      name: r.landmarkName,
      comment: r.comment || '',
      highlights: r.highlights || [],
      updatedAt: r.updatedAt,
    })),
    ...baselineToSyntheticReviews(myProfile?.tasteBaseline),
  ];
  const { confidence, sampleCount } = computeTasteConfidence(reviews);
  const unlocked = hasInsiderMode(confidence);
  const hasBaseline = !!(myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length);

  const closeEditor = async () => {
    setEditing(false);
    await reloadFriends();
  };

  if (editing) {
    return <TasteNudgeCard editing initialBaseline={myProfile?.tasteBaseline} initialNotes={myProfile?.tasteBaselineNotes} onDone={closeEditor} onDismiss={closeEditor} />;
  }

  if (sampleCount < 2) {
    return (
      <div className="card section taste-profile-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F9E9}'} Taste Profile</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {hasBaseline ? `${'\u{270F}\u{FE0F}'} Edit` : `${'\u{2795}'} Answer a few quick picks`}
          </button>
        </div>
        <p className="screen-subtitle" style={{ margin: '6px 0 0' }}>
          Rate a couple more places (or answer the quick-pick questions) and Mapr can start scoring how well it
          actually knows your taste.
        </p>
      </div>
    );
  }

  return (
    <div className="card section taste-profile-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F9E9}'} Taste Profile — {confidence}% confident</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {unlocked && (
            <span className="tag" style={{ fontSize: '0.65rem' }} title={`Unlocked at ${INSIDER_MODE_CONFIDENCE}% confidence`}>
              {'\u{1F511}'} Insider Mode
            </span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {'\u{270F}\u{FE0F}'} Edit
          </button>
        </div>
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
