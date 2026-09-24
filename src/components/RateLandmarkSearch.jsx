import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_LANDMARKS, getRegion } from '../data/regions';
import { addCustomLandmark, getCustomLandmarks } from '../lib/customLandmarks';
import { nearestRegionId } from '../lib/geo';
import { searchPlaces, getPlaceDetails, makeSessionToken } from '../lib/places';
import { useCheckIn } from '../lib/useCheckIn';
import { useAuth } from '../lib/AuthContext';
import { authErrorMessage } from '../lib/authErrors';
import { isRateable } from '../lib/ratingFlow';

// The first card in "Your Mapr Picks" -- a big "+" tile the same size and
// shape as a real pick card, so rating something isn't a separate feature
// bolted above the carousel but the obvious first thing in it.
//
// Typing first searches the app's own catalog (curated landmarks + whatever
// anyone's submitted) -- no network call, instant. If nothing matches there
// (a real place just nobody's added yet, like a random restaurant), it
// falls back to a live Google Places address search, the same one Add
// Landmark uses. Picking one of those runs it through the exact same
// verify-landmark research/AI-fill pipeline Add Landmark does and saves it
// as a new custom landmark, so "rate a landmark" never dead-ends on "not in
// our catalog" the way it did before -- Google has it, so this should too.
//
// Picking a result (catalog or newly-created) calls the same checkIn(landmark)
// every "Check In" button in the app calls, with { requireComment: true,
// ratingOnly: true } -- it opens the existing global rate + post prompt
// (CheckInReview), which is what actually claims the check-in and saves the
// rating. ratingOnly tells commitCheckIn (CheckInContext) to claim the visit
// for 0 points instead of the usual +100 -- this is a rating, not a claim
// you were there, so it shouldn't pay out like one. It's still the same one
// real check-in for every other purpose: it counts toward the daily streak
// exactly like a real visit (computeStreakDays only needs one check-in that
// day, see src/lib/streaks.js), so if you show up later and tap Check In for
// real, it's already claimed (no double points either way) and reopens the
// same prompt to edit your rating -- "rate again" always means editing,
// never a duplicate. The review this writes feeds Mapr Picks' matching the
// same way every other review does (src/lib/maprPicks.js / api/mapr-picks.js
// read categories/tier/highlights/comment from reviews), so the mandatory
// comment here is exactly what a plain yes/no vote can't give Mapr to learn
// from.
export default function RateLandmarkSearch() {
  const { checkIn, user } = useCheckIn();
  const { resendVerification } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [customLandmarks, setCustomLandmarks] = useState([]);

  const [remoteResults, setRemoteResults] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  // One id per Autocomplete+Details "session" (Google's billing unit) --
  // reused across keystrokes, then replaced once a place is actually added.
  const sessionTokenRef = useRef(makeSessionToken());

  useEffect(() => {
    if (open) getCustomLandmarks().then(setCustomLandmarks);
  }, [open]);

  const openSearch = () => {
    setTerm('');
    setRemoteResults([]);
    setRemoteError('');
    setCreateError('');
    setOpen(true);
  };
  const close = () => setOpen(false);

  const pick = (landmark) => {
    // Mandatory comment here, only here -- a plain "Check In" doesn't
    // require one. Mapr needs to know *why* when there's no visit context
    // to lean on. ratingOnly keeps this from paying out check-in points.
    checkIn(landmark, { requireComment: true, ratingOnly: true });
    close();
  };

  const q = term.trim().toLowerCase();
  const pool = [
    ...ALL_LANDMARKS,
    ...customLandmarks.map((l) => ({
      ...l,
      regionId: l.region,
      categories: l.categories || [],
    })),
  ].filter(isRateable);
  const results = q
    ? pool
        .filter((l) => {
          const haystack = [l.name, l.summary, ...(l.facts ?? [])].join(' ').toLowerCase();
          return haystack.includes(q);
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8)
    : [];

  // Only reach for a live Places search once the catalog has genuinely come
  // up empty -- most searches match something already in the app and never
  // need it.
  useEffect(() => {
    if (!open || results.length > 0 || term.trim().length < 2) {
      setRemoteResults([]);
      setRemoteLoading(false);
      setRemoteError('');
      return;
    }
    setRemoteLoading(true);
    setRemoteError('');
    const handle = setTimeout(async () => {
      try {
        const suggestions = await searchPlaces(term, null, sessionTokenRef.current);
        setRemoteResults(suggestions);
      } catch (e) {
        setRemoteError(e.message || 'Address search failed.');
      } finally {
        setRemoteLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, results.length, open]);

  // A place Google knows about but this app's never seen -- research it and
  // save it as a real custom landmark (identical to what Add Landmark does),
  // then go straight into rating it. Nothing here is invented: verify-landmark
  // either finds real facts/a real photo for it or leaves them blank.
  const pickRemote = async (s) => {
    if (!user) {
      setCreateError('Sign in first to add a new place.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const details = await getPlaceDetails(s.placeId, sessionTokenRef.current);
      sessionTokenRef.current = makeSessionToken();
      const finalName = details.primary || s.primary;
      const idToken = await user.getIdToken();
      const verifyRes = await fetch('/api/verify-landmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          name: finalName,
          categories: [],
          lat: details.lat,
          lng: details.lng,
          imageDataUrl: '',
          userFacts: [],
        }),
      });
      const verified = await verifyRes.json().catch(() => null);
      if (verified?.code === 'email-not-verified') {
        // Same recovery as Add Landmark: try to fire off a fresh link
        // rather than ask them to go dig up the original one.
        let resent = false;
        let resendErr = null;
        try {
          await resendVerification();
          resent = true;
        } catch (e) {
          resendErr = e;
        }
        throw new Error(
          resent
            ? 'Verify your email first — we just sent a fresh link to your inbox (check spam too), then try again.'
            : `Verify your email first — check your inbox for the verification link we already sent you (check spam too), then try again. (Couldn't send another one: ${authErrorMessage(resendErr)})`
        );
      }
      if (!verifyRes.ok || !verified) throw new Error(verified?.error || 'Could not verify this place — try again.');
      if (!verified.ok) throw new Error(verified.reason || "That doesn't look like a real place — try a different search.");

      const region = nearestRegionId(details.lat, details.lng);
      const created = await addCustomLandmark({
        region,
        name: finalName,
        lat: details.lat,
        lng: details.lng,
        userId: user.uid,
        categories: verified.category ? [verified.category] : [],
        images: verified.imageUrl ? [verified.imageUrl] : [],
        summary: verified.summary,
        facts: verified.facts,
        free: verified.free,
        typicalMinutes: verified.typicalMinutes || undefined,
      });
      pick({ ...created, regionId: created.region });
    } catch (e) {
      setCreateError(e.message || 'Could not add that place — try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button type="button" className="mapr-pick mapr-pick-add" onClick={openSearch}>
        <span className="mapr-pick-add-plus" aria-hidden="true">+</span>
        <span className="mapr-pick-add-label">Rate a Landmark</span>
        <span className="mapr-pick-add-sub">Search &amp; rate anything</span>
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={() => !creating && close()}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{'⭐'} Rate a Landmark</h3>
              <p className="screen-subtitle" style={{ marginTop: 0 }}>
                Search for a place you've been and rate it directly — no need to wait for it to show up as a pick.
              </p>
              <div className="field" style={{ marginBottom: 0 }}>
                <input
                  type="text"
                  placeholder={'\u{1F50D} Search landmarks or any place…'}
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setCreateError('');
                  }}
                  autoFocus
                  disabled={creating}
                />
              </div>
              {q && (
                <div className="autocomplete-list" style={{ position: 'static', marginTop: 8, boxShadow: 'none' }}>
                  {results.map((l) => (
                    <button
                      type="button"
                      key={`${l.regionId}-${l.id}`}
                      className="autocomplete-item"
                      onClick={() => pick(l)}
                      disabled={creating}
                    >
                      <span className="autocomplete-primary">{l.name}</span>
                      <span className="autocomplete-secondary">{getRegion(l.regionId)?.name}</span>
                    </button>
                  ))}
                  {results.length === 0 && remoteLoading && (
                    <div className="autocomplete-loading">Searching…</div>
                  )}
                  {results.length === 0 && !remoteLoading && remoteError && (
                    <div className="autocomplete-loading">{remoteError}</div>
                  )}
                  {results.length === 0 && !remoteLoading && !remoteError && remoteResults.length === 0 && (
                    <div className="autocomplete-loading">No place matches "{term}".</div>
                  )}
                  {results.length === 0 &&
                    !remoteLoading &&
                    remoteResults.map((s) => (
                      <button
                        type="button"
                        key={s.placeId}
                        className="autocomplete-item"
                        onClick={() => pickRemote(s)}
                        disabled={creating}
                      >
                        <span className="autocomplete-primary">{s.primary}</span>
                        {s.secondary && <span className="autocomplete-secondary">{s.secondary}</span>}
                      </button>
                    ))}
                </div>
              )}
              {creating && (
                <p className="screen-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
                  Adding this place — researching facts and a photo…
                </p>
              )}
              {createError && (
                <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
                  {createError}
                </p>
              )}
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 16 }} disabled={creating} onClick={close}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
