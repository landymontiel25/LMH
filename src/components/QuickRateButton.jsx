import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useRatings } from '../lib/RatingsContext';
import { submitReview, getMyReview } from '../lib/reviews';
import { isRateable } from '../lib/ratingFlow';
import RatingFlow from './RatingFlow';

// TEMPORARY. A "Rate" pill next to a landmark's name so places checked
// into before the rating flow existed can be rated now. Rating normally
// happens only at check-in; delete this file and its three call sites
// (map popup, Landmarks list, itinerary card) once the backlog is rated.
//
// Only shows for a landmark you've checked into: the reviews rules
// require a check-in doc to exist, and that's the set worth going back
// to anyway. Pre-fills from your existing rating so tapping it again is
// an edit, not a duplicate.
export default function QuickRateButton({ landmark }) {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const { claimedMap } = useCheckIn();
  const { reload: reloadRatings } = useRatings();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(undefined); // undefined = still loading
  const [rating, setRating] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!firebaseEnabled || !user || !claimedMap[landmark.id] || !isRateable(landmark)) return null;

  const openModal = async (e) => {
    e.stopPropagation();
    setMsg(null);
    setRating(null);
    setInitial(undefined);
    setOpen(true);
    try {
      const r = await getMyReview(user.uid, landmark.id);
      setInitial(
        r?.ratingTier
          ? {
              tier: r.ratingTier,
              highlights: r.highlights || [],
              lovedOrder: r.lovedOrder || [],
              dislikedOrder: r.dislikedOrder || [],
            }
          : null
      );
    } catch {
      setInitial(null);
    }
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
      <button type="button" className="btn btn-ghost btn-tight quick-rate-btn" onClick={openModal}>
        {'\u{2B50}'} Rate
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={close}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>
                {'\u{2B50}'} Rate {landmark.name}
              </h3>
              {initial === undefined ? (
                <p className="screen-subtitle">Loading…</p>
              ) : (
                <>
                  <p className="screen-subtitle" style={{ marginTop: 0 }}>
                    {initial ? 'Change your rating below.' : 'How was it? One tap is enough — the rest is optional.'}
                  </p>
                  <RatingFlow key={landmark.id} landmark={landmark} initial={initial} onChange={setRating} />
                </>
              )}
              {msg && (
                <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                  {msg}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary btn-block" disabled={saving || !rating} onClick={save}>
                  {saving ? 'Saving…' : 'Save rating'}
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
