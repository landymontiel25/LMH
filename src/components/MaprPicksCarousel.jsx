import { useEffect, useRef, useState } from 'react';
import { getPickFeedback, recentlyPassedIds, setPickFeedback } from '../lib/pickFeedback';
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
  // { [landmarkId]: 'yes' | 'no' } -- your ✓ / ✗ on picks, for the buttons'
  // state and as a light signal to Mapr next time.
  const [feedback, setFeedback] = useState({});
  const trackRef = useRef(null);
  const ratingsCount = reviews?.length || 0;

  useEffect(() => {
    if (!user) {
      setPicks(null);
      return;
    }
    let cancelled = false;
    const key = picksCacheKey(user.uid, ratingsCount, origin);
    (async () => {
      const fb = await getPickFeedback(user.uid);
      if (cancelled) return;
      setFeedback(Object.fromEntries(Object.values(fb).map((f) => [f.landmarkId, f.verdict])));
      const passedIds = recentlyPassedIds(fb);
      const fbList = Object.values(fb).map((f) => ({ name: f.name, region: f.region, categories: f.categories, verdict: f.verdict }));
      const cached = readPicksCache(key);
      if (cached) {
        setPicks(cached.filter((p) => !passedIds.includes(p.id)));
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
          feedback: fbList,
          passedIds,
        });
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
            feedback: fbList,
            passedIds,
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

  // ✓ keeps the card (marked); ✗ removes it, from the cache too, so it
  // doesn't come back on the next visit while its cooldown runs.
  const vote = (p, verdict) => {
    setFeedback((cur) => ({ ...cur, [p.id]: verdict }));
    setPickFeedback({ uid: user.uid, landmark: { id: p.id, region: p.region, name: p.name, categories: p.categories || [] }, verdict, origin });
    if (verdict === 'no') {
      setPicks((cur) => {
        const next = (cur || []).filter((x) => x.id !== p.id);
        writePicksCache(picksCacheKey(user.uid, ratingsCount, origin), next);
        return next;
      });
    }
  };

  if (!user || !picks || picks.length === 0) return null;

  return (
    <div className="mapr-picks">
      <div className="taste-card-title">{'\u{1F525}'} Your Mapr Picks</div>
      <p className="taste-card-note" style={{ margin: '0 0 10px' }}>
        {origin ? 'Near you right now. ' : ''}Tap a card to go there. {'\u{2713}'} / {'\u{2715}'} teach Mapr what you like.
      </p>
      <div className="mapr-picks-track" ref={trackRef} onScroll={onScroll}>
        {picks.map((p) => {
          const v = feedback[p.id];
          return (
            <div key={`${p.region}/${p.id}`} className={`mapr-pick ${v === 'yes' ? 'liked' : ''}`}>
              <button type="button" className="mapr-pick-main" onClick={() => navigate(`/landmarks/${p.region}/${p.id}`)}>
                {p.image ? (
                  <img className="mapr-pick-img" src={p.image} alt="" loading="lazy" />
                ) : (
                  <div className="mapr-pick-img mapr-pick-img-blank">{'\u{1F4CD}'}</div>
                )}
                <span className="mapr-pick-match">{'\u{1F525}'} {p.matchPercentage}% match</span>
                <span className="mapr-pick-name">{p.name}</span>
                <span className="mapr-pick-sub">{p.oneLineSummary}</span>
              </button>
              <div className="mapr-pick-actions">
                <button
                  type="button"
                  className={`mapr-pick-vote yes ${v === 'yes' ? 'on' : ''}`}
                  onClick={() => vote(p, 'yes')}
                  title="I'd go"
                >
                  {'\u{2713}'} {v === 'yes' ? "You'd go" : "I'd go"}
                </button>
                <button type="button" className="mapr-pick-vote no" onClick={() => vote(p, 'no')} title="Not for me">
                  {'\u{2715}'} Not for me
                </button>
              </div>
            </div>
          );
        })}
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
