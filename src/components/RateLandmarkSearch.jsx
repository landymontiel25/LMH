import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_LANDMARKS, getRegion } from '../data/regions';
import { getCustomLandmarks } from '../lib/customLandmarks';
import { useCheckIn } from '../lib/useCheckIn';
import { isRateable } from '../lib/ratingFlow';

// The first card in "Your Mapr Picks" -- a big "+" tile the same size and
// shape as a real pick card, so rating something isn't a separate feature
// bolted above the carousel but the obvious first thing in it. Rate
// anything in the catalog directly, without waiting for it to show up as a
// pick or physically checking in there first. Search is the same plain
// client-side name/summary/facts filter LandmarkSelection uses (no network
// call, no Google Places -- this searches the app's own landmark catalog,
// not arbitrary addresses), merged with user-submitted landmarks the same
// way.
//
// Picking a result calls the same checkIn(landmark) every "Check In" button
// in the app calls, with { requireComment: true, ratingOnly: true } -- it
// opens the existing global rate + post prompt (CheckInReview), which is
// what actually claims the check-in and saves the rating. ratingOnly tells
// commitCheckIn (CheckInContext) to claim the visit for 0 points instead of
// the usual +100 -- this is a rating, not a claim you were there, so it
// shouldn't pay out like one. It's still the same one real check-in for
// every other purpose: it counts toward the daily streak exactly like a
// real visit (computeStreakDays only needs one check-in that day, see
// src/lib/streaks.js), so if you show up later and tap Check In for real,
// it's already claimed (no double points either way) and reopens the same
// prompt to edit your rating -- "rate again" always means editing, never a
// duplicate. The review this writes feeds Mapr Picks' matching the same
// way every other review does (src/lib/maprPicks.js / api/mapr-picks.js
// read categories/tier/highlights/comment from reviews), so the mandatory
// comment here is exactly what a plain yes/no vote can't give Mapr to
// learn from.
export default function RateLandmarkSearch() {
  const { checkIn } = useCheckIn();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [customLandmarks, setCustomLandmarks] = useState([]);

  useEffect(() => {
    if (open) getCustomLandmarks().then(setCustomLandmarks);
  }, [open]);

  const openSearch = () => {
    setTerm('');
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

  return (
    <>
      <button type="button" className="mapr-pick mapr-pick-add" onClick={openSearch}>
        <span className="mapr-pick-add-plus" aria-hidden="true">+</span>
        <span className="mapr-pick-add-label">Rate a Landmark</span>
        <span className="mapr-pick-add-sub">Search &amp; rate anything</span>
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={close}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{'⭐'} Rate a Landmark</h3>
              <p className="screen-subtitle" style={{ marginTop: 0 }}>
                Search for a place you've been and rate it directly — no need to wait for it to show up as a pick.
              </p>
              <div className="field" style={{ marginBottom: 0 }}>
                <input
                  type="text"
                  placeholder={'\u{1F50D} Search landmarks…'}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  autoFocus
                />
              </div>
              {q && (
                <div className="autocomplete-list" style={{ position: 'static', marginTop: 8, boxShadow: 'none' }}>
                  {results.length === 0 && <div className="autocomplete-loading">No rateable landmarks match "{term}".</div>}
                  {results.map((l) => (
                    <button
                      type="button"
                      key={`${l.regionId}-${l.id}`}
                      className="autocomplete-item"
                      onClick={() => pick(l)}
                    >
                      <span className="autocomplete-primary">{l.name}</span>
                      <span className="autocomplete-secondary">{getRegion(l.regionId)?.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={close}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
