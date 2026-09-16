import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getLandmark, getRegion, INTERESTS } from '../data/regions';
import { getCustomLandmark, reportCustomLandmark } from '../lib/customLandmarks';
import { blockUser } from '../lib/blocks';
import { useTrip } from '../lib/TripContext';
import { useGeo } from '../lib/GeoContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useRatings } from '../lib/RatingsContext';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { useFriends } from '../lib/FriendsContext';
import { submitReview, getMyReview, getLandmarkReviews, reportReview, deleteMyReview } from '../lib/reviews';
import { isRateable, tierById } from '../lib/ratingFlow';
import { getMyCheckin } from '../lib/leaderboard';
import RatingFlow from '../components/RatingFlow';
import LandmarkPostcard from '../components/LandmarkPostcard';
import ReviewReplies from '../components/ReviewReplies';
import CheckInButton from '../components/CheckInButton';
import RatingStars from '../components/RatingStars';
import { mapsDeepLink } from '../lib/routing';
import { pickPhoto } from '../lib/imageUtils';

const CATEGORY_LABEL = Object.fromEntries(INTERESTS.map((i) => [i.id, i.label]));

// "Tuesday, Sep 15 at 3:47 PM"
function fmtCheckinTime(seconds) {
  const d = new Date(seconds * 1000);
  const day = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}
const FACTS_PREVIEW = 5;

export default function LandmarkDetail() {
  const { region: regionId, id } = useParams();
  const navigate = useNavigate();
  // Set when you arrived from a check-ins gallery: the gallery's full order
  // plus this landmark's position in it, so the header can offer ‹ › to
  // step through your check-ins one by one.
  const location = useLocation();
  const checkinNav = location.state?.checkinNav || null;
  const navPrev = checkinNav && checkinNav.index > 0 ? checkinNav.sequence[checkinNav.index - 1] : null;
  const navNext =
    checkinNav && checkinNav.index < checkinNav.sequence.length - 1 ? checkinNav.sequence[checkinNav.index + 1] : null;
  const stepCheckin = (delta) => {
    const index = checkinNav.index + delta;
    const target = checkinNav.sequence[index];
    if (!target) return;
    window.scrollTo(0, 0);
    navigate(`/landmarks/${target.regionId}/${target.landmarkId}`, {
      replace: true,
      state: { checkinNav: { ...checkinNav, index } },
    });
  };
  const { toggleLandmark, getRegionSelection, updateTrip, setMapFocus, setMapFocusPoint } = useTrip();
  const { user, firebaseEnabled, claimedMap, checkingIn, checkIn } = useCheckIn();
  const { coords } = useGeo();
  const region = getRegion(regionId);
  const staticLandmark = getLandmark(regionId, id);
  // Not in the built-in catalog -- might be a user-submitted one from
  // "Add Landmark" on the map, so fetch it from Firestore by the same id.
  const [customLandmark, setCustomLandmark] = useState(null);
  const [customLoading, setCustomLoading] = useState(!staticLandmark);

  useEffect(() => {
    if (staticLandmark) {
      setCustomLoading(false);
      return;
    }
    let cancelled = false;
    setCustomLoading(true);
    getCustomLandmark(id).then((l) => {
      if (cancelled) return;
      setCustomLandmark(l);
      setCustomLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, staticLandmark]);

  // Memoized so it's referentially stable across renders once resolved --
  // several effects below key off "landmark changed" (e.g. the one-shot map
  // focus point on first open), which would misfire on every render otherwise
  // since the custom-landmark branch would build a brand-new object each time.
  const landmark = useMemo(
    () =>
      staticLandmark ||
      (customLandmark && {
        ...customLandmark,
        regionId: customLandmark.region,
        categories: customLandmark.categories || [],
        images: customLandmark.images || [],
        facts: customLandmark.facts || [],
        free: customLandmark.free ?? true,
        typicalMinutes: customLandmark.typicalMinutes ?? 15,
      }),
    [staticLandmark, customLandmark]
  );
  const { ratings, reload: reloadRatings } = useRatings();
  const { reload: reloadMyPhotos } = useMyPhotos();
  const { myUsername } = useFriends();
  // myRating: live RatingFlow payload (null until a tier is picked).
  // savedRating: what's already on file, to pre-fill the flow on an edit.
  const [myRating, setMyRating] = useState(null);
  const [savedRating, setSavedRating] = useState(null);
  // Your own check-in doc here (for "Checked in: Tuesday, Sep 15 at 3:47 PM").
  const [myCheckin, setMyCheckin] = useState(null);
  const [myPhotos, setMyPhotos] = useState([]);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  // True right after a successful save: the button itself reads "Rating
  // submitted!" until the user changes something in the flow again.
  const [submitted, setSubmitted] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reportedNow, setReportedNow] = useState(() => new Set());
  const [blockedNow, setBlockedNow] = useState(() => new Set());
  const [landmarkReported, setLandmarkReported] = useState(false);
  const [factsExpanded, setFactsExpanded] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const askAI = async (e, preset) => {
    e?.preventDefault?.();
    const q = (preset ?? aiQuestion).trim();
    if (!q || aiBusy) return;
    if (preset) setAiQuestion(preset);
    setAiBusy(true);
    setAiError('');
    setAiAnswer('');
    try {
      const r = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landmark: landmark?.name, city: region?.name, question: q }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Something went wrong.');
      setAiAnswer(data.answer);
    } catch (err) {
      setAiError(err.message || 'Could not reach the AI. Try again.');
    } finally {
      setAiBusy(false);
    }
  };

  // Remember which city this landmark belongs to, so tapping Back returns to
  // that city's list (not whatever the popularity sort floats to the top).
  useEffect(() => {
    if (regionId) {
      updateTrip({ activeRegion: regionId });
      setMapFocus(regionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  // Open every landmark at the TOP (its photo), not wherever the previous page
  // was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector('.app-main')?.scrollTo?.(0, 0);
  }, [id]);

  // After viewing a landmark, the map should open zoomed right onto IT (via the
  // Map tab or the "See it on the Map" button) so you can see exactly where you
  // are, then pinch out. One-shot: the map consumes and clears it.
  useEffect(() => {
    if (landmark) setMapFocusPoint({ lat: landmark.lat, lng: landmark.lng, name: landmark.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, landmark]);

  const loadMyReview = useCallback(async () => {
    if (!firebaseEnabled || !user || !landmark) return;
    const r = await getMyReview(user.uid, landmark.id);
    if (!r) return;
    // A pre-tier review (plain stars, no ratingTier) doesn't pre-fill the
    // new flow -- the user just rates fresh, which overwrites it.
    setSavedRating(
      r.ratingTier
        ? {
            tier: r.ratingTier,
            highlights: r.highlights || [],
            lovedOrder: r.lovedOrder || [],
            dislikedOrder: r.dislikedOrder || [],
            comment: r.comment || '',
          }
        : null
    );
    setMyPhotos(r.photoURLs?.length ? r.photoURLs : r.photoURL ? [r.photoURL] : []);
  }, [firebaseEnabled, user, landmark]);

  useEffect(() => {
    loadMyReview();
  }, [loadMyReview]);

  const checkedInHere = !!(landmark && claimedMap[landmark.id]);
  useEffect(() => {
    if (!firebaseEnabled || !user || !landmark || !checkedInHere) {
      setMyCheckin(null);
      return;
    }
    let cancelled = false;
    getMyCheckin(user.uid, landmark.id)
      .then((c) => {
        if (!cancelled) setMyCheckin(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, user, landmark, checkedInHere]);

  const loadReviews = useCallback(async () => {
    if (!firebaseEnabled || !landmark) return;
    try {
      // firestore.rules already excludes any review reported past the
      // hide threshold (unless it's yours or you're an admin), so whatever
      // comes back here is exactly what's safe to show -- no client-side
      // report-count filtering needed anymore.
      setReviews(await getLandmarkReviews(landmark.id));
    } catch {
      /* rules / index not set yet */
    }
  }, [firebaseEnabled, landmark]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  if (!region || (!landmark && !customLoading)) {
    return (
      <div className="empty-state">
        <p>Landmark not found.</p>
        <button className="btn btn-primary" onClick={() => navigate('/landmarks')}>
          Back to List
        </button>
      </div>
    );
  }

  if (!landmark) {
    return <p className="screen-subtitle" style={{ textAlign: 'center', marginTop: 40 }}>Loading…</p>;
  }

  const isSelected = getRegionSelection(regionId).includes(landmark.id);
  const agg = ratings[landmark.id];
  const canRate = firebaseEnabled && user && claimedMap[landmark.id];

  const onPhotoChange = async () => {
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

  const handleSubmitReview = async () => {
    if (!myRating) {
      setSaveMsg('Pick one of the three first.');
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await submitReview({
        userId: user.uid,
        userName: myUsername || user.displayName || 'Explorer',
        landmark,
        rating: myRating,
        photoFiles,
      });
      await reloadRatings();
      await loadReviews();
      await loadMyReview();
      await reloadMyPhotos();
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setSubmitted(true);
      setSaveMsg(res?.photoFailed ? "Rating saved — but your photo couldn't upload." : null);
    } catch (e) {
      setSaveMsg(e.message || 'Could not save your rating.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMine = async () => {
    await deleteMyReview(user.uid, landmark.id);
    setSavedRating(null);
    setMyRating(null);
    setMyPhotos([]);
    await reloadRatings();
    await loadReviews();
    await reloadMyPhotos();
  };

  const handleReport = async (rv) => {
    setReportedNow((s) => new Set(s).add(rv.id));
    try {
      await reportReview({ reporterUid: user.uid, review: rv });
      await loadReviews();
    } catch {
      /* ignore */
    }
  };

  const handleBlock = async (rv) => {
    setBlockedNow((s) => new Set(s).add(rv.userId));
    try {
      await blockUser(user.uid, rv.userId, rv.userName);
      await loadReviews();
    } catch {
      /* ignore */
    }
  };

  const handleReportLandmark = async () => {
    if (!customLandmark || !user) return;
    setLandmarkReported(true);
    try {
      await reportCustomLandmark(user.uid, customLandmark.docId);
    } catch {
      /* ignore */
    }
  };

  const shareVisit = async () => {
    const checkedIn = !!claimedMap[landmark.id];
    const url = `${window.location.origin}/#/landmarks/${regionId}/${landmark.id}`;
    const text = checkedIn
      ? `\u{1F3AF} I just checked in at ${landmark.name} on Landmark Hunters — come explore and try to beat my score! \u{1F3C6}`
      : `\u{1F4CD} Check out ${landmark.name} on Landmark Hunters — hunt landmarks, check in, and earn points!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Landmark Hunters', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareMsg('Link copied — paste it to your friends! \u{1F4E3}');
        setTimeout(() => setShareMsg(null), 4000);
      }
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  return (
    <div>
      <div className="detail-topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          {'← Back'}
        </button>
        {checkinNav && (
          <div className="checkin-stepper">
            <button
              type="button"
              className="btn btn-ghost btn-sm checkin-stepper-btn"
              onClick={() => stepCheckin(-1)}
              disabled={!navPrev}
              aria-label={navPrev ? `Previous check-in: ${navPrev.name}` : 'No previous check-in'}
              title={navPrev?.name || ''}
            >
              {'\u{2039}'}
            </button>
            <span className="checkin-stepper-count">
              {checkinNav.index + 1} / {checkinNav.sequence.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm checkin-stepper-btn"
              onClick={() => stepCheckin(1)}
              disabled={!navNext}
              aria-label={navNext ? `Next check-in: ${navNext.name}` : 'No next check-in'}
              title={navNext?.name || ''}
            >
              {'\u{203A}'}
            </button>
          </div>
        )}
      </div>

      <LandmarkPostcard landmark={landmark} size="lg" swipeable myPhotos={myPhotos} onImageClick={setLightboxSrc} />

      <h1 className="screen-title" style={{ justifyContent: 'center', textAlign: 'center' }}>
        {landmark.name}
      </h1>

      <div className="center" style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        {landmark.categories.map((c) => (
          <span key={c} className="tag">
            {CATEGORY_LABEL[c]}
          </span>
        ))}
        <span className={`tag ${landmark.free ? 'tag-free' : ''}`}>{landmark.free ? 'Free to Visit' : 'Ticketed'}</span>
        <span className="tag">{'~' + landmark.typicalMinutes + ' min'}</span>
        {customLandmark && <span className="tag">{'\u{2728}'} Community-submitted</span>}
        {customLandmark?.status === 'pending' && <span className="tag tag-error">{'\u{23F3}'} Pending Approval</span>}
      </div>
      {customLandmark?.status === 'pending' && (
        <p className="screen-subtitle" style={{ textAlign: 'center', marginTop: -10 }}>
          Only visible to you right now — a moderator needs to approve it before it shows up for everyone else.
        </p>
      )}
      {customLandmark && user && customLandmark.createdBy !== user.uid && (
        <p className="center" style={{ marginTop: -10, marginBottom: 18 }}>
          {landmarkReported ? (
            <span className="review-reported">Reported ✓</span>
          ) : (
            <button className="btn btn-ghost btn-tight" onClick={handleReportLandmark}>
              Report this landmark
            </button>
          )}
        </p>
      )}

      <div className="center" style={{ marginBottom: 18 }}>
        <RatingStars value={agg?.avg || 0} count={agg?.count || 0} size="1.15rem" />
      </div>

      <div className="card section">
        <p style={{ fontSize: '1.02rem', margin: 0 }}>{landmark.summary}</p>
      </div>

      {landmark.tip && (
        <div
          className="card section"
          style={{
            borderLeft: '4px solid #f5a623',
            background: 'rgba(245, 166, 35, 0.10)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '1.2rem', lineHeight: 1.3 }}>{'⚠️'}</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            <strong>Good to know:</strong> {landmark.tip}
          </p>
        </div>
      )}

      {landmark.facts.length > 0 && (
      <div className="section">
        <h3>Quick Facts</h3>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          {(factsExpanded ? landmark.facts : landmark.facts.slice(0, FACTS_PREVIEW)).map((f, i) => (
            <li key={i} style={{ marginBottom: 8, lineHeight: 1.5 }}>
              {f}
            </li>
          ))}
        </ul>
        {landmark.facts.length > FACTS_PREVIEW && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFactsExpanded((v) => !v)}
            style={{ marginTop: 10 }}
          >
            {factsExpanded
              ? 'Show less'
              : `Show ${landmark.facts.length - FACTS_PREVIEW} more`}
          </button>
        )}
      </div>
      )}

      {firebaseEnabled && user && (
        <div className="section">
          <h3>Your Check-in Stats</h3>
          {!checkedInHere ? (
            <p className="screen-subtitle" style={{ margin: 0 }}>
              You haven't checked in yet. Check in to see your stats.
            </p>
          ) : (
            <ul className="checkin-stats">
              <li>
                <span>Checked in:</span> {myCheckin?.createdAt?.seconds ? fmtCheckinTime(myCheckin.createdAt.seconds) : '…'}
              </li>
              <li>
                <span>Your rating:</span>{' '}
                {savedRating?.tier ? `${tierById(savedRating.tier)?.emoji || ''} ${tierById(savedRating.tier)?.label || ''}` : 'Not rated yet'}
              </li>
            </ul>
          )}
        </div>
      )}

      <a
        className="btn btn-ghost btn-block"
        href={mapsDeepLink(landmark.name, landmark.lat, landmark.lng)}
        target="_blank"
        rel="noreferrer"
        style={{ marginBottom: 12 }}
      >
        {'\u{1F9ED}'} Get Directions
      </a>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginBottom: 12 }}
        onClick={() => {
          setMapFocusPoint({ lat: landmark.lat, lng: landmark.lng, name: landmark.name });
          navigate('/');
        }}
      >
        {'\u{1F5FA}\u{FE0F}'} See it on the Map
      </button>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginBottom: aiOpen ? 10 : 12 }}
        onClick={() => setAiOpen((o) => !o)}
      >
        {'✨'} Ask AI about {landmark.name}
      </button>

      {aiOpen && (
        <div className="card section ai-box" style={{ marginBottom: 12 }}>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            Ask anything — history, tips, what to see or eat, best time to go…
          </p>
          <div className="ai-chips">
            {['Give me a quick overview', 'Best time to visit?', 'What should I not miss?', 'Where should I eat nearby?'].map(
              (chip) => (
                <button key={chip} type="button" className="tag ai-chip" onClick={(e) => askAI(e, chip)} disabled={aiBusy}>
                  {chip}
                </button>
              )
            )}
          </div>
          <form onSubmit={askAI} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              type="text"
              placeholder={`Ask about ${landmark.name}…`}
              value={aiQuestion}
              maxLength={500}
              onChange={(e) => setAiQuestion(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={aiBusy || !aiQuestion.trim()}>
              {aiBusy ? '…' : 'Ask'}
            </button>
          </form>
          {aiBusy && <p className="screen-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>Thinking…</p>}
          {aiError && (
            <p className="tag tag-error" style={{ display: 'block', marginTop: 10, marginBottom: 0 }}>
              {aiError}
            </p>
          )}
          {aiAnswer && <div className="ai-answer">{aiAnswer}</div>}
          <p className="ai-disclaimer">AI can be wrong — double-check hours &amp; prices before you go.</p>
        </div>
      )}

      <button
        type="button"
        className={`btn btn-block ${isSelected ? 'btn-success' : 'btn-primary'}`}
        onClick={() => toggleLandmark(landmark.id, regionId)}
        style={{ marginBottom: 12 }}
      >
        {isSelected ? '✓ Added to Itinerary' : 'Add to Itinerary'}
      </button>

      <CheckInButton
        landmark={landmark}
        user={user}
        firebaseEnabled={firebaseEnabled}
        claimedMap={claimedMap}
        checkingIn={checkingIn}
        onCheckIn={checkIn}
        className="btn-block"
      />

      <button type="button" className="btn btn-primary btn-block" onClick={shareVisit} style={{ marginTop: 12 }}>
        {'\u{1F3C6}'} Share with Friends & Family
      </button>
      {shareMsg && (
        <p className="screen-subtitle" style={{ textAlign: 'center', marginTop: 6, marginBottom: 0 }}>
          {shareMsg}
        </p>
      )}

      {firebaseEnabled && isRateable(landmark) && (
        <div className="card section" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Rate your visit</h3>
          {!user ? (
            <p className="screen-subtitle" style={{ margin: 0 }}>Sign in to rate this place.</p>
          ) : !claimedMap[landmark.id] ? (
            <p className="screen-subtitle" style={{ margin: 0 }}>
              Check in here first to rate it and add a photo.
            </p>
          ) : (
            <>
              {savedRating && (
                <p className="screen-subtitle" style={{ marginTop: 0 }}>
                  {'\u{2713}'} Already rated — change anything below and submit again.
                </p>
              )}
              <RatingFlow
                key={landmark.id}
                landmark={landmark}
                initial={savedRating}
                onChange={(r) => {
                  setMyRating(r);
                  setSubmitted(false);
                }}
              />
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onPhotoChange}>
                    {'\u{1F4F8}'} Add photo ({photoFiles.length}/3)
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: 12 }}
                disabled={saving || submitted || !myRating}
                onClick={handleSubmitReview}
              >
                {saving ? 'Saving…' : submitted ? '\u{2713} Rating submitted!' : 'Submit Rating'}
              </button>
              {saveMsg && (
                <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                  {saveMsg}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {firebaseEnabled && reviews.length > 0 && (
        <div className="section">
          <h3>Visitor Reviews ({reviews.length})</h3>
          {reviews.map((r) => {
            const mine = user && r.userId === user.uid;
            return (
              <div key={r.id} className="review-item">
                <div className="review-head">
                  <strong>{r.userName}</strong>
                  <RatingStars value={r.stars} count={null} />
                </div>
                {r.comment && <p className="review-comment">{r.comment}</p>}
                {(() => {
                  // firestore.rules already filtered this list down to reviews
                  // this viewer is allowed to see in full (their own, a
                  // friend's, or a public account's) -- so any photo here is
                  // safe to show, no separate client-side gate needed.
                  const photos = r.photoURLs?.length ? r.photoURLs : r.photoURL ? [r.photoURL] : [];
                  if (!photos.length) return null;
                  return (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {photos.map((u, i) => (
                        <img
                          key={i}
                          src={u}
                          alt={`${r.userName}'s visit ${i + 1}`}
                          className="review-photo"
                          style={{ cursor: 'zoom-in', maxWidth: photos.length > 1 ? '31%' : '100%' }}
                          onClick={() => setLightboxSrc(u)}
                        />
                      ))}
                    </div>
                  );
                })()}
                {user && (
                  <div className="review-actions">
                    {mine ? (
                      <button className="btn btn-ghost btn-tight" onClick={handleDeleteMine}>
                        Delete
                      </button>
                    ) : blockedNow.has(r.userId) ? (
                      <span className="review-reported">Blocked ✓</span>
                    ) : (
                      <>
                        {reportedNow.has(r.id) || r.reportedBy?.includes(user.uid) ? (
                          <span className="review-reported">Reported ✓</span>
                        ) : (
                          <button className="btn btn-ghost btn-tight" onClick={() => handleReport(r)}>
                            Report
                          </button>
                        )}
                        <button className="btn btn-ghost btn-tight" onClick={() => handleBlock(r)}>
                          Block
                        </button>
                      </>
                    )}
                  </div>
                )}
                <ReviewReplies reviewId={r.id} currentUser={user} reviewAuthorUid={r.userId} />
              </div>
            );
          })}
        </div>
      )}

      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <img
            src={lightboxSrc}
            alt="Visit photo"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 10 }}
          />
        </div>
      )}
    </div>
  );
}
