import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useRatings } from '../lib/RatingsContext';
import { submitReview } from '../lib/reviews';
import { isRateable } from '../lib/ratingFlow';
import RatingFlow from './RatingFlow';

// TEMPORARY. A "Rate" pill next to a landmark's name so places checked
// into before the rating flow existed can be rated now. Rating normally
// happens only at check-in; delete this file and its three call sites
// (map popup, Landmarks list, itinerary card) once the backlog is rated.
//
// Only shows for a landmark you've checked into: the reviews rules
// require a check-in doc to exist, and that's the set worth going back
// to anyway. Once rated it reads "Rated · Edit" and opens pre-filled from
// the shared myReviews map, so tapping again edits, never duplicates.
export default function QuickRateButton({ landmark }) {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const { claimedMap } = useCheckIn();
  const { myReviews, reload: reloadRatings } = useRatings();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!firebaseEnabled || !user || !claimedMap[landmark.id] || !isRateable(landmark)) return null;

  const mine = myReviews[landmark.id];
  // A pre-tier review (plain stars, no ratingTier) still counts as "rated"
  // but can't pre-fill the new flow -- it just opens fresh.
  const initial = mine?.ratingTier
    ? {
        tier: mine.ratingTier,
        highlights: mine.highlights || [],
        lovedOrder: mine.lovedOrder || [],
        dislikedOrder: mine.dislikedOrder || [],
      }
    : null;

  const openModal = (e) => {
    e.stopPropagation();
    setMsg(null);
    setRating(null);
    setOpen(true);
  };

  const close = () => {
    if (!saving) setOpen(false);
  };

  const save = async () => {
    if (!rating || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await submitReview({
        userId: user.uid,
        userName: myUsername || user.displayName || 'Explorer',
        landmark,
        rating,
      });
      await reloadRatings();
      setOpen(false);
    } catch (e) {
      setMsg(e.message || 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-tight quick-rate-btn ${mine ? 'rated' : ''}`}
        onClick={openModal}
      >
        {mine ? '\u{2713} Rated \u{00B7} Edit' : '\u{2B50} Rate'}
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={close}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>
                {'\u{2B50}'} {mine ? 'Edit your rating' : 'Rate'} {mine ? 'of ' : ''}
                {landmark.name}
              </h3>
              <p className="screen-subtitle" style={{ marginTop: 0 }}>
                {mine
                  ? 'Already rated — change anything below and save.'
                  : 'How was it? One tap is enough — the rest is optional.'}
              </p>
              <RatingFlow key={`${landmark.id}-${open}`} landmark={landmark} initial={initial} onChange={setRating} />
              {msg && (
                <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                  {msg}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary btn-block" disabled={saving || !rating} onClick={save}>
                  {saving ? 'Saving…' : mine ? 'Save changes' : 'Save rating'}
                </button>
                <button className="btn btn-ghost" onClick={close} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
