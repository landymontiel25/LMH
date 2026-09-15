import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getLandmark, getRegion } from '../data/regions';
import { getUserCheckins } from '../lib/leaderboard';
import { getMyReview } from '../lib/reviews';

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
    const build = (c, myPhoto) => {
      const lm = getLandmark(c.region, c.landmarkId);
      // Prefer the photo saved AT check-in, then a rating photo, then the
      // landmark's stock image.
      const mine = c.photoURL || myPhoto || null;
      return {
        id: c.id,
        landmarkId: c.landmarkId,
        regionId: c.region,
        name: c.landmarkName || lm?.name || c.landmarkId,
        photo: mine || lm?.images?.[0] || null,
        isMine: !!mine,
        city: getRegion(c.region)?.name || c.region,
        points: c.points || 0,
        date: fmtDateTime(c.createdAt?.seconds),
      };
    };

    (async () => {
      let rows = [];
      try {
        rows = await getUserCheckins(user.uid);
      } catch {
        rows = [];
      }
      if (cancelled) return;
      // Show right away using landmark photos, so the gallery is never blank…
      setCheckins(rows.map((c) => build(c, null)));
      // …then upgrade each tile to YOUR own photo via direct doc reads (the
      // reviews/{uid}_{landmarkId} doc), which the security rules allow.
      const myPhotos = await Promise.all(
        rows.map((c) =>
          getMyReview(user.uid, c.landmarkId)
            .then((r) => (r?.photoURLs?.length ? r.photoURLs[0] : r?.photoURL || null))
            .catch(() => null)
        )
      );
      if (cancelled) return;
      if (myPhotos.some(Boolean)) setCheckins(rows.map((c, i) => build(c, myPhotos[i])));
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
  const go = (it) => {
    sessionStorage.setItem(scrollKey, String(window.scrollY));
    const sequence = checkins.map((c) => ({ regionId: c.regionId, landmarkId: c.landmarkId, name: c.name }));
    navigate(`/landmarks/${it.regionId}/${it.landmarkId}`, {
      state: { checkinNav: { sequence, index: checkins.indexOf(it) } },
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

      {checkins === null && <p className="screen-subtitle">Loading your check-ins…</p>}
      {checkins !== null && checkins.length === 0 && (
        <div className="empty-state">
          <p>No check-ins yet — find a landmark and check in with a photo! 📸</p>
        </div>
      )}

      {checkins && checkins.length > 0 && layout === 'list' && (
        <div style={{ marginTop: 12 }}>
          {checkins.map((it) => (
            <div key={it.id} className="checkin-row" onClick={() => go(it)}>
              {it.photo ? (
                <img className="checkin-list-thumb" src={it.photo} alt={it.name} loading="lazy" />
              ) : (
                <div className="checkin-thumb-blank" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="checkin-name">{it.name}</div>
                <div className="checkin-sub">
                  {it.city}
                  {it.date ? ` · ${it.date}` : ''}
                </div>
              </div>
              <div className="checkin-pts">+{it.points}</div>
            </div>
          ))}
        </div>
      )}

      {checkins && checkins.length > 0 && layout === 'grid' && (
        <div className="checkin-grid">
          {checkins.map((it) => (
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
