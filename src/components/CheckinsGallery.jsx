import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getLandmark, getRegion } from '../data/regions';
import { getUserCheckins } from '../lib/leaderboard';
import { getMyReview } from '../lib/reviews';
import { isRateable, tierById, tierStars } from '../lib/ratingFlow';
import { CHECKIN_SORTS, sortCheckins } from '../lib/checkinSort';


// Shared "Sep 7, 2026, 10:04 AM" formatting for check-in timestamps.
function fmtDateTime(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// The full photo gallery of everywhere you've checked in -- lives on the
// Full Stats page (moved out of the Ranks tab strip, which is now just
// This Week / This Month / This Year).
export default function CheckinsGallery({ user, claimedMap, navigate, totalPoints, title = 'My Check-ins' }) {
  const [checkins, setCheckins] = useState(null);
  const [layout, setLayout] = useState('list'); // 'list' | 'grid'
  const [sort, setSort] = useState(() => {
    try {
      const saved = localStorage.getItem('lh-checkins-sort');
      return CHECKIN_SORTS.some((o) => o.id === saved) ? saved : 'recent';
    } catch {
      return 'recent';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lh-checkins-sort', sort);
    } catch {
      /* private mode */
    }
  }, [sort]);
  // Tapping a check-in navigates to its landmark page; the ErrorBoundary
  // above every route is keyed by pathname, so coming back here via the
  // Back button fully remounts this gallery instead of leaving it in
  // place -- without this, that remount always starts scrolled to the
  // top, no matter how far down the list you'd scrolled to tap something.
  // sessionStorage (not React state) is what survives that remount; the
  // path itself is the key so a friend's gallery and your own don't clash.
  const location = useLocation();
  const scrollKey = `checkins-scroll:${location.pathname}`;
  const restoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const build = (c, review) => {
      const lm = getLandmark(c.region, c.landmarkId);
      // Prefer the photo saved AT check-in, then a rating photo, then the
      // landmark's stock image.
      const myPhoto = review?.photoURLs?.length ? review.photoURLs[0] : review?.photoURL || null;
      const mine = c.photoURL || myPhoto || null;
      // Only a tier rating (the chips flow) counts; a leftover star-only
      // review sorts as unrated, same as the Profile counter.
      const tier = review?.ratingTier ? tierById(review.ratingTier) : null;
      return {
        id: c.id,
        landmarkId: c.landmarkId,
        regionId: c.region,
        name: c.landmarkName || lm?.name || c.landmarkId,
        photo: mine || lm?.images?.[0] || null,
        isMine: !!mine,
        city: getRegion(c.region)?.name || c.region,
        points: c.points || 0,
        createdAt: c.createdAt?.seconds || 0,
        date: fmtDateTime(c.createdAt?.seconds),
        rateable: lm ? isRateable(lm) : true,
        stars: tier ? tierStars(tier.id) : null,
        tierEmoji: tier?.emoji || null,
        tierLabel: tier?.label || null,
      };
    };

    (async () => {
      let rows = [];
      try {
        rows = await getUserCheckins(user.uid);
      } catch {
        rows = [];
      }
      // A "Rate a Landmark" claim (ratingOnly, 0 points) isn't a visit --
      // it never belongs here, only in My Mapr Ratings.
      rows = rows.filter((c) => c.points !== 0);
      if (cancelled) return;
      // Show right away using landmark photos, so the gallery is never blank…
      setCheckins(rows.map((c) => build(c, null)));
      // …then upgrade each tile with the user's own review via direct doc
      // reads (the reviews/{uid}_{landmarkId} doc), which the security rules
      // allow: their photo, and their rating for the rating sorts.
      const reviews = await Promise.all(
        rows.map((c) => getMyReview(user.uid, c.landmarkId).catch(() => null))
      );
      if (cancelled) return;
      if (reviews.some(Boolean)) setCheckins(rows.map((c, i) => build(c, reviews[i])));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, claimedMap]);

  // Restore once, right after the list has real content to scroll through --
  // and only once, so a later fresh visit to this same page doesn't jump to
  // some stale leftover position.
  useEffect(() => {
    if (!checkins || restoredRef.current) return;
    restoredRef.current = true;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved == null) return;
    sessionStorage.removeItem(scrollKey);
    requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
  }, [checkins, scrollKey]);

  // The landmark page gets the whole gallery order in navigation state so
  // its ‹ › arrows can step to the previous / next check-in without coming
  // back here. Each step replaces the history entry, so Back still returns
  // to this list (at the saved scroll position) no matter how far you paged.
  const shown = checkins ? sortCheckins(checkins, sort) : null;
  const hiddenCount = checkins && shown ? checkins.length - shown.length : 0;

  const go = (it) => {
    sessionStorage.setItem(scrollKey, String(window.scrollY));
    const sequence = shown.map((c) => ({ regionId: c.regionId, landmarkId: c.landmarkId, name: c.name }));
    navigate(`/landmarks/${it.regionId}/${it.landmarkId}`, {
      state: { checkinNav: { sequence, index: shown.indexOf(it) } },
    });
  };

  return (
    <div className="section">
      <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
        <div className="rank-hero-pts" style={{ fontSize: '1.8rem' }}>
          {totalPoints.toLocaleString()} <span>total points</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{'\u{1F4F8}'} {title} {checkins ? `(${checkins.length})` : ''}</h3>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab-btn ${layout === 'list' ? 'active' : ''}`} onClick={() => setLayout('list')}>
            {'\u{1F4C4}'} List
          </button>
          <button className={`tab-btn ${layout === 'grid' ? 'active' : ''}`} onClick={() => setLayout('grid')}>
            {'\u{1F5BC}\u{FE0F}'} Grid
          </button>
        </div>
      </div>

      {checkins && checkins.length > 0 && (
        <div className="itin-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <label className="itin-sort">
            <span>Sort by</span>
            <select className="radius-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {CHECKIN_SORTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {hiddenCount > 0 && (
            <span className="screen-subtitle" style={{ margin: 0, fontSize: '0.75rem' }}>
              {hiddenCount} unrateable {hiddenCount === 1 ? 'spot' : 'spots'} hidden
            </span>
          )}
        </div>
      )}

      {checkins === null && <p className="screen-subtitle">Loading your check-ins…</p>}
      {checkins !== null && checkins.length === 0 && (
        <div className="empty-state">
          <p>No check-ins yet — find a landmark and check in with a photo! 📸</p>
        </div>
      )}
      {shown && checkins.length > 0 && shown.length === 0 && (
        <p className="screen-subtitle">Nothing rateable here yet — switch back to Most recent to see everything.</p>
      )}

      {shown && shown.length > 0 && layout === 'list' && (
        <div style={{ marginTop: 12 }}>
          {shown.map((it) => (
            <div
              key={it.id}
              className="checkin-row"
              role="button"
              tabIndex={0}
              onClick={() => go(it)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  go(it);
                }
              }}
            >
              {it.photo ? (
                <img className="checkin-list-thumb" src={it.photo} alt={it.name} loading="lazy" />
              ) : (
                <div className="checkin-thumb-blank" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="checkin-name">{it.name}</div>
                <div className="checkin-sub">{it.tierEmoji ? `${it.tierEmoji} ${it.tierLabel}` : 'Not rated yet'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {shown && shown.length > 0 && layout === 'grid' && (
        <div className="checkin-grid">
          {shown.map((it) => (
            <button type="button" key={it.id} className="checkin-tile" onClick={() => go(it)}>
              {it.photo ? (
                <img src={it.photo} alt={it.name} loading="lazy" />
              ) : (
                <div className="checkin-thumb-blank" style={{ width: '100%', height: '100%' }} />
              )}
              <span className="checkin-tile-name">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
