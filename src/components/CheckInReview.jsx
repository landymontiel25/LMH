import { useEffect, useState } from 'react';
import { useCheckIn } from '../lib/useCheckIn';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useRatings } from '../lib/RatingsContext';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { submitReview } from '../lib/reviews';
import RatingStars from './RatingStars';

// Pops up the moment "Check In" is tapped, to rate + optionally add photos —
// but nothing is claimed yet. Tapping Post is what actually registers the
// check-in (via commitCheckIn) and awards the points; Cancel walks away with
// nothing recorded at all.
export default function CheckInReview() {
  const { justCheckedIn, celebration, commitCheckIn, clearJustCheckedIn } = useCheckIn();
  const { user } = useAuth();
  const { myUsername } = useFriends();
  const { reload: reloadRatings } = useRatings();
  const { reload: reloadMyPhotos } = useMyPhotos();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (justCheckedIn) {
      setStars(0);
      setComment('');
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setMsg(null);
      setPosted(false);
    }
  }, [justCheckedIn]);

  if (!justCheckedIn) return null;

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
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
    if (!stars) {
      setMsg('Tap a star rating first.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await commitCheckIn();
      const res = await submitReview({
        userId: user.uid,
        userName: myUsername || user.displayName || 'Explorer',
        landmark: justCheckedIn,
        stars,
        comment,
        photoFiles,
      });
      await reloadRatings();
      await reloadMyPhotos();
      if (res?.photoFailed) {
        // Check-in + rating saved; only the photo didn't. Don't trap the user.
        setMsg("Checked in! Your photo couldn't upload — tap Done to close.");
      }
      setPosted(true);
    } catch (e) {
      setMsg(e.message || 'Could not check in — try again.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => clearJustCheckedIn();

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
            <p className="screen-subtitle" style={{ marginTop: 0 }}>
              Rate it and add a photo (optional), then tap Post to check in.
            </p>

            <div style={{ textAlign: 'center', margin: '6px 0 12px' }}>
              <RatingStars value={stars} interactive onChange={setStars} size="2.2rem" />
            </div>

            <textarea
              className="review-comment-input"
              placeholder="Add a note (optional)"
              value={comment}
              maxLength={500}
              rows={2}
              onChange={(e) => setComment(e.target.value)}
              style={{ width: '100%' }}
            />

            {photoPreviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
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
              <div style={{ marginTop: 10 }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {'\u{1F4F8}'} Add photo ({photoFiles.length}/3)
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhoto} />
                </label>
              </div>
            )}

            {msg && (
              <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {msg}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-block" disabled={saving || !stars} onClick={submit}>
                {saving ? 'Posting…' : 'Post'}
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
