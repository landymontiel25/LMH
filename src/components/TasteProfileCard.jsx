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
  // profileFresh: true only once a REAL server read of the profile has
  // landed this session. Before that, myProfile is at best the localStorage
  // prefill from some earlier session (which can predate the taste picks
  // entirely) -- rendering that as "you have no picks" is exactly what made
  // the card look empty on app open until something else re-fetched it.
  const { myProfile, profileFresh, reload: reloadFriends } = useFriends();
  const { myReviews } = useRatings();
  const [editing, setEditing] = useState(false);
  // Bridges the gap between "saveTasteBaseline's write resolved" and "the
  // FriendsContext re-render carrying the reloaded myProfile has actually
  // happened" -- without this, closing the editor right after Save could
  // render once (or more) against the STILL-STALE myProfile from before the
  // reload settled, showing the old/empty state until something else (like
  // reopening and closing Edit again) happened to trigger another render
  // after the reload had caught up. Cleared once reloadFriends() in
  // closeEditor below actually resolves, so myProfile is the source of
  // truth again from then on.
  const [justSaved, setJustSaved] = useState(null);
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
    // Never decide "there's no baseline, recover one from tasteIntro" off the
    // localStorage prefill -- that snapshot can be from before the picks
    // were ever saved, and acting on it would overwrite the real server
    // baseline with whatever the stale text yields. Wait for a real read.
    if (!profileFresh) return;
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
  }, [user, profileFresh, myProfile?.tasteIntro, myProfile?.tasteBaseline, reloadFriends]);

  if (!user) return null;

  // The server read hasn't landed yet (and nothing was just saved this
  // session to show in its place): say so, instead of rendering the empty
  // "answer a few quick picks" state -- or letting Edit open pre-filled
  // with nothing -- against data that simply isn't here yet.
  if (!profileFresh && !justSaved && !editing) {
    return (
      <div className="card section taste-profile-card">
        <div className="taste-head">
          <span className="taste-title">Taste Profile</span>
          <span className="tag">Loading…</span>
        </div>
        <p className="taste-note">Loading what you've told Mapr…</p>
      </div>
    );
  }

  // justSaved (set the instant TasteNudgeCard's Save succeeds) wins over
  // myProfile until the reload below confirms it -- see the state comment.
  const effectiveBaseline = justSaved ? justSaved.baseline : myProfile?.tasteBaseline;
  const effectiveNotes = justSaved ? justSaved.notes : myProfile?.tasteBaselineNotes;
  const effectiveCategoryNotes = justSaved ? justSaved.categoryNotes : myProfile?.tasteBaselineCategoryNotes;

  const reviews = [
    ...Object.values(myReviews).map((r) => ({
      tier: r.ratingTier,
      categories: r.categories || [],
      name: r.landmarkName,
      comment: r.comment || '',
      highlights: r.highlights || [],
      updatedAt: r.updatedAt,
    })),
    ...baselineToSyntheticReviews(effectiveBaseline, effectiveCategoryNotes),
  ];
  const { confidence, sampleCount } = computeTasteConfidence(reviews);
  const hasBaseline = !!(effectiveBaseline && Object.keys(effectiveBaseline).length);

  const closeEditor = async (saved) => {
    if (saved) setJustSaved(saved);
    setEditing(false);
    await reloadFriends();
    // myProfile is caught up now (or this was just a dismiss with nothing
    // to catch up on) -- go back to trusting it as the single source of
    // truth instead of holding onto this forever.
    setJustSaved(null);
  };

  if (editing) {
    return (
      <TasteNudgeCard
        editing
        initialBaseline={effectiveBaseline}
        initialNotes={effectiveNotes}
        initialCategoryNotes={effectiveCategoryNotes}
        onDone={closeEditor}
        onDismiss={closeEditor}
      />
    );
  }

  if (sampleCount < 2) {
    return (
      <div className="card section taste-profile-card">
        <div className="taste-head">
          <span className="taste-title">Taste Profile</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEditing}>
            {hasBaseline ? 'Edit' : 'Answer a few quick picks'}
          </button>
        </div>
        <p className="taste-note">
          Rate a couple more places (or answer the quick-pick questions) and Mapr can start scoring how well it
          actually knows your taste.
        </p>
      </div>
    );
  }

  return (
    <div className="card section taste-profile-card">
      <div className="taste-head">
        <button type="button" className="taste-title" onClick={startEditing} aria-label="Edit your taste profile">
          Taste Profile
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <div className="taste-meter">
          <div
            className="level-bar-track"
            role="progressbar"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="level-bar-fill" style={{ width: `${confidence}%` }} />
          </div>
          <div className="taste-pct">
            <strong>{confidence}%</strong>
            <span>confident</span>
          </div>
        </div>
      </div>
      <p className="taste-note">
        How well Mapr can predict a rating of yours from your OTHER ratings alone. The more you rate — across
        different kinds of places — the higher this climbs.
      </p>
    </div>
  );
}
