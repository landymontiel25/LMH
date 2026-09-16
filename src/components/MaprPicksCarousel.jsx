import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useRatings } from '../lib/RatingsContext';
import { useGeo } from '../lib/GeoContext';
import { coarseLocation, localMaprPicks, picksCacheKey, readPicksCache, writePicksCache } from '../lib/maprPicks';

// "Your Mapr Picks": 3-4 landmarks Mapr thinks you'll love next, as a
// swipeable card row under the taste card. Asks /api/mapr-picks (Claude,
// fed your ratings, chips and comments); if that's unavailable it falls
// back to a local affinity score so the row never comes up empty. Cached
// for a day per user and rating count.
export default function MaprPicksCarousel({ reviews, interests = [], checkedInIds = [], regionIds = [] }) {
  const { user } = useAuth();
  const { ratings } = useRatings();
  const { coords } = useGeo();
  const navigate = useNavigate();
  // Picks are about where you are right now. Without a fix yet we wait a
  // beat for one rather than answer for the wrong city.
  const origin = coords ? { lat: coords.lat, lng: coords.lng } : null;
  const locKey = coarseLocation(origin);
  const [picks, setPicks] = useState(null);
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  const ratingsCount = reviews?.length || 0;

  useEffect(() => {
    if (!user) {
      setPicks(null);
      return;
    }
    let cancelled = false;
    const key = picksCacheKey(user.uid, ratingsCount, origin);
    const cached = readPicksCache(key);
    if (cached) {
      setPicks(cached);
      return;
    }
    const fallback = () =>
      localMaprPicks({
        reviews: reviews.map((r) => ({ tier: r.ratingTier, categories: r.categories || [] })),
        interests,
        checkedInIds,
        regionIds,
        origin,
        ratings,
      });
    (async () => {
      let next = null;
      try {
        const r = await fetch('/api/mapr-picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviews: reviews.map((r) => ({
              name: r.landmarkName,
              tier: r.ratingTier,
              categories: r.categories || [],
              highlights: r.highlights || [],
              comment: r.comment || '',
            })),
            interests,
            checkedInIds,
            regionIds,
            origin,
          }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.picks?.length) next = data.picks;
      } catch {
        /* offline -- fall through to the local scorer */
      }
      if (cancelled) return;
      // Drop anything checked into since the picks were made.
      const visited = new Set(checkedInIds);
      const list = (next || fallback()).filter((p) => !visited.has(p.id)).slice(0, 4);
      setPicks(list);
      if (next) writePicksCache(key, list);
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when the user, their rating count, or their coarse location
    // changes; the other inputs ride along with those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, ratingsCount, locKey]);

  // Which card is in view, for the dots.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const w = el.firstElementChild.getBoundingClientRect().width + 10;
    setActive(Math.round(el.scrollLeft / w));
  };

  if (!user || !picks || picks.length === 0) return null;

  return (
    <div className="mapr-picks">
      <div className="taste-card-title">{'\u{1F525}'} Your Mapr Picks</div>
      <p className="taste-card-note" style={{ margin: '0 0 10px' }}>
        {origin ? 'Near you right now. ' : ''}Swipe through — tap one to go there and check in.
      </p>
      <div className="mapr-picks-track" ref={trackRef} onScroll={onScroll}>
        {picks.map((p) => (
          <button
            type="button"
            key={`${p.region}/${p.id}`}
            className="mapr-pick"
            onClick={() => navigate(`/landmarks/${p.region}/${p.id}`)}
          >
            {p.image ? (
              <img className="mapr-pick-img" src={p.image} alt="" loading="lazy" />
            ) : (
              <div className="mapr-pick-img mapr-pick-img-blank">{'\u{1F4CD}'}</div>
            )}
            <span className="mapr-pick-match">{'\u{1F525}'} {p.matchPercentage}% match</span>
            <span className="mapr-pick-name">{p.name}</span>
            <span className="mapr-pick-sub">{p.oneLineSummary}</span>
          </button>
        ))}
      </div>
      {picks.length > 1 && (
        <div className="mapr-picks-dots" aria-hidden="true">
          {picks.map((p, i) => (
            <span key={p.id} className={`mapr-picks-dot ${i === active ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
