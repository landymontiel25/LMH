import { useCallback, useEffect, useState } from 'react';
import { useCheckIn } from '../lib/useCheckIn';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useRatings } from '../lib/RatingsContext';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { submitReview } from '../lib/reviews';
import { attachCheckinPhoto } from '../lib/leaderboard';
import { pickPhoto } from '../lib/imageUtils';
import { isRateable } from '../lib/ratingFlow';
import RatingFlow from './RatingFlow';
import CheckInBlast from './CheckInBlast';

// Pops up the moment "Check In" is tapped -- nothing is claimed yet. Tapping
// Post is what actually registers the check-in (via commitCheckIn) and awards
// the points; Cancel walks away with nothing recorded at all.
//
// Rateable landmarks (history, art, food) get the tier -> chips -> aspects
// flow. A campus-only spot skips rating entirely: one tap confirms the
// check-in, since there's nothing useful Mapr could learn from ranking a
// dorm on Food/Service.
export default function CheckInReview() {
  const { justCheckedIn, celebration, commitCheckIn, clearJustCheckedIn } = useCheckIn();
  const { user } = useAuth();
  const { myUsername } = useFriends();
  const { reload: reloadRatings } = useRatings();
  const { reload: reloadMyPhotos } = useMyPhotos();
  const [rating, setRating] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [posted, setPosted] = useState(false);
  // The full-screen blast shows the instant a check-in posts, then hands
  // off to the quieter "Checked in! +100" panel below.
  const [blast, setBlast] = useState(false);
  const endBlast = useCallback(() => setBlast(false), []);

  useEffect(() => {
    if (justCheckedIn) {
      setRating(null);
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setMsg(null);
      setPosted(false);
      setBlast(false);
    }
  }, [justCheckedIn]);

  if (!justCheckedIn) return null;

  const rateable = isRateable(justCheckedIn);

  const onPhoto = async () => {
    const f = await pickPhoto();
    if (f) {
      setPhotoFiles((prev) => (prev.length < 3 ? [...prev, f] : prev));
      setPhotoPreviews((prev) => (prev.length < 3 ? [...prev, URL.createObjectURL(f)] : prev));
    }
  };
  const removePhoto = (i) => {
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPhotoPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (rateable && !rating) {
      setMsg('Pick one of the three first.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await commitCheckIn();
    } catch (e) {
      // The check-in write itself failed -- no points awarded, nothing to
      // show as posted.
      setMsg(e.message || 'Could not check in — try again.');
      setSaving(false);
      return;
    }
    // Points are awarded the moment commitCheckIn resolves. Everything past
    // this point (rating, photo) is a bonus save -- a failure here must
    // never read as "check-in failed" when it actually succeeded.
    if (rateable) {
      try {
        const res = await submitReview({
          userId: user.uid,
          userName: myUsername || user.displayName || 'Explorer',
          landmark: justCheckedIn,
          rating,
          photoFiles,
        });
        await reloadRatings();
        await reloadMyPhotos();
        if (res?.photoFailed) {
          setMsg("Checked in! Your photo couldn't upload — tap Done to close.");
        }
      } catch {
        setMsg("Checked in! Your rating couldn't save — you can try rating it again from the landmark page.");
      }
    } else if (photoFiles.length) {
      // No rating here, so the photo lives on the check-in doc instead.
      try {
        await attachCheckinPhoto(user.uid, justCheckedIn.id, photoFiles[0]);
        await reloadMyPhotos();
      } catch {
        setMsg("Checked in! Your photo couldn't upload — tap Done to close.");
      }
    }
    setPosted(true);
    setBlast(true);
    setSaving(false);
  };

  const close = () => clearJustCheckedIn();

  if (posted && blast) {
    return (
      <CheckInBlast
        landmarkName={justCheckedIn.landmark?.name || justCheckedIn.name || ''}
        points={celebration?.points ?? justCheckedIn.points ?? 100}
        message={celebration?.message}
        onDone={endBlast}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && close()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {posted ? (
          <>
            <h3 style={{ marginTop: 0 }}>
              {'\u{1F3AF}'} Checked in! +{celebration?.points ?? justCheckedIn.points ?? 100} pts
            </h3>
            {celebration?.message && <div className="celebration-banner">{celebration.message}</div>}
            {msg && (
              <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {msg}
              </p>
            )}
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={close}>
              Done
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>{'\u{1F4CD}'} Check in to {justCheckedIn.name}?</h3>
            {rateable ? (
              <>
                <p className="screen-subtitle" style={{ marginTop: 0 }}>
                  How was it? One tap is enough — the rest is optional.
                </p>
                <RatingFlow key={justCheckedIn.id} landmark={justCheckedIn} onChange={setRating} />
              </>
            ) : (
              <p className="screen-subtitle" style={{ marginTop: 0 }}>
                Add a photo if you like, then tap Confirm.
              </p>
            )}

            {photoPreviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {photoPreviews.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 10, display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                        border: 'none', background: 'rgba(0,0,0,0.78)', color: '#fff', cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photoFiles.length < 3 && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onPhoto}>
                  {'\u{1F4F8}'} Add photo ({photoFiles.length}/3)
                </button>
              </div>
            )}

            {msg && (
              <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {msg}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-block" disabled={saving || (rateable && !rating)} onClick={submit}>
                {saving ? 'Posting…' : rateable ? 'Post' : 'Confirm check-in \u{2713}'}
              </button>
              <button className="btn btn-ghost" onClick={close} disabled={saving}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
