import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useRatings } from '../lib/RatingsContext';
import { saveTasteBaseline, saveTasteIntro } from '../lib/friends';
import { computeTasteConfidence } from '../lib/tasteProfile';
import { baselineToSyntheticReviews, extractLegacyBaselineFromIntro } from '../lib/tasteQuestions';
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
  const migratedRef = useRef(false);
  // Set the instant the Edit card is opened, and checked again right before
  // the migration below actually writes anything. Without this, opening
  // Edit and saving fresh picks could race an in-flight migration -- the
  // migration's write (old picks recovered from legacy tasteIntro text)
  // could land AFTER the user's own save and silently clobber it back to
  // the old values, which is exactly the "my picks aren't saving" bug this
  // guard exists to prevent. Once the user is actively managing their own
  // baseline, the one-time recovery isn't needed anyway.
  const suppressMigrationRef = useRef(false);

  const startEditing = () => {
    suppressMigrationRef.current = true;
    setEditing(true);
  };

  // One-time recovery for accounts that answered the taste nudge before the
  // structured tasteBaseline field existed -- back then, picks were baked
  // straight into the free-text tasteIntro (see extractLegacyBaselineFromIntro
  // for the exact format this recognizes). Those answers never went away,
  // but the Edit button above has nothing to prefill from since it only
  // reads tasteBaseline, so they looked lost. Runs once per load; once
  // tasteBaseline is populated the guard clause below skips it for good.
  useEffect(() => {
    if (!user || migratedRef.current || suppressMigrationRef.current) return;
    if (myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length) return;
    if (!myProfile?.tasteIntro) return;
    const { baseline, remainingIntro } = extractLegacyBaselineFromIntro(myProfile.tasteIntro);
    if (!baseline) return;
    migratedRef.current = true;
    (async () => {
      try {
        // Re-check right before writing -- the user may have opened Edit
        // and started saving their own picks while this was in flight.
        if (suppressMigrationRef.current) {
          migratedRef.current = false;
          return;
        }
        await saveTasteBaseline(user.uid, { baseline, notes: '' });
        await saveTasteIntro(user.uid, remainingIntro);
        await reloadFriends();
      } catch {
        migratedRef.current = false;
      }
    })();
  }, [user, myProfile?.tasteIntro, myProfile?.tasteBaseline, reloadFriends]);

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
    ...baselineToSyntheticReviews(myProfile?.tasteBaseline, myProfile?.tasteBaselineCategoryNotes),
  ];
  const { confidence, sampleCount } = computeTasteConfidence(reviews);
  const hasBaseline = !!(myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length);

  const closeEditor = async () => {
    setEditing(false);
    await reloadFriends();
  };

  if (editing) {
    return (
      <TasteNudgeCard
        editing
        initialBaseline={myProfile?.tasteBaseline}
        initialNotes={myProfile?.tasteBaselineNotes}
        initialCategoryNotes={myProfile?.tasteBaselineCategoryNotes}
        onDone={closeEditor}
        onDismiss={closeEditor}
      />
    );
  }

  if (sampleCount < 2) {
    return (
      <div className="card section taste-profile-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F9E9}'} Taste Profile</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEditing}>
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={startEditing}>
          {'\u{270F}\u{FE0F}'} Edit
        </button>
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
        How well Mapr can predict a rating of yours from your OTHER ratings alone. The more you rate — across
        different kinds of places — the higher this climbs.
      </p>
    </div>
  );
}
