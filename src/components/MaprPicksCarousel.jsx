import { useEffect, useRef, useState } from 'react';
import { getPickFeedback, readLocalFeedback, votedIds, setPickFeedback } from '../lib/pickFeedback';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useGeo } from '../lib/GeoContext';
import { useBadges } from '../lib/BadgesContext';
import { coarseLocation, picksCacheKey, readPicksCache, writePicksCache } from '../lib/maprPicks';
import { composeTasteIntro, tasteFingerprint } from '../lib/tasteQuestions';
import { PICKS_STREAK_THRESHOLD } from '../lib/streaks';
import { useTrip } from '../lib/TripContext';
import { getRegionCheckinCounts } from '../lib/leaderboard';
import { recordShownPicks, saveRebuiltTagScores, saveSettledPicks } from '../lib/friends';
import {
  capMaps,
  localTagPicks,
  pickRegion,
  rebuildTagScores,
  settleShownPicks,
  TAG_SCORES_VERSION,
} from '../lib/tagScores';
import RateLandmarkSearch from './RateLandmarkSearch';

// "Your Mapr Picks": landmarks Mapr thinks you'll love next, as a
// swipeable card row under the taste card. Capped at RESERVE (10) on
// screen at once -- swiping alone never loads more; only voting (✓/✗/not
// sure) on one pulls in a replacement, so the deck only grows once you've
// actually weighed in. Asks /api/mapr-picks for 8 (its tag scorer
// shortlists 30 in your current region, Claude picks from those).
// Replacement cards, the instant first paint, and the fallback when the API
// is unavailable all come from the same tag scorer on-device (localTagPicks),
// so every card follows one set of rules. Cached per user, rating count,
// taste fingerprint and coarse location.
const RESERVE = 10;

const localDayKey = () => new Date().toLocaleDateString('en-CA');

export default function MaprPicksCarousel({ reviews, interests = [], checkedInIds = [], regionIds = [] }) {
  const { user } = useAuth();
  const { myProfile, profileFresh } = useFriends();
  const { trip } = useTrip();
  const { coords } = useGeo();
  const { reload: reloadBadges, actionsToday } = useBadges();
  const navigate = useNavigate();
  // Picks are about where you are right now. Without a fix yet we wait a
  // beat for one rather than answer for the wrong city.
  const origin = coords ? { lat: coords.lat, lng: coords.lng } : null;
  const locKey = coarseLocation(origin);
  const [queue, setQueue] = useState(null); // up to RESERVE picks; voting on one pulls in the next
  const [active, setActive] = useState(0);
  // { [landmarkId]: 'yes' | 'no' | 'unsure' } -- your ✓ / ✗ / "not sure" on
  // picks, for the buttons' state and as a light signal to Mapr next time.
  // "unsure" carries no taste signal at all -- not a like, not a dislike,
  // just "ask me again later". It drops out of THIS deck (this state keeps
  // it out of the immediate refill in vote() below) but, unlike ✓/✗, is
  // never permanently blacklisted -- see votedIds in pickFeedback.js.
  const [feedback, setFeedback] = useState({});
  // Region check-in counts once fetched, for on-device picks after that.
  const countsRef = useRef({});
  const trackRef = useRef(null);
  const ratingsCount = reviews?.length || 0;
  // Everything a traveler has told Mapr that ISN'T a landmark rating --
  // taste intro + baseline picks + per-category comments (see
  // tasteFingerprint) -- changing any of it must invalidate the picks
  // cache immediately, the same as a new rating already does via
  // ratingsCount, not wait on the TTL.
  const tasteFP = `${tasteFingerprint(myProfile)}.${myProfile?.tagScoresVersion || 0}`;
  // A landmark you've already left a rating for should never come back as
  // a "pick" -- checkedInIds alone misses this, since "Rate a Landmark"
  // deliberately claims its check-in for 0 points (not a real visit), so
  // it never shows up there even though you've clearly already weighed in.
  const reviewedIds = new Set(reviews.map((r) => r.landmarkId).filter(Boolean));
  const excludeIds = [...new Set([...checkedInIds, ...reviewedIds])];
  // Oldest -> newest, so the server prompt (which is told this ordering) can
  // actually weigh a recent change of taste over a large pile of older
  // ratings, instead of averaging everything together as if said at once.
  const orderedReviews = [...reviews].sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));
  // Fold in loveNotes -- the "why do you love this place" answers from
  // repeat visits (see LoveReasonPrompt) -- alongside a rating's comment.
  const commentWithLoveNotes = (r) => [r.comment, ...(r.loveNotes || [])].filter(Boolean).join('. ');
  const region = pickRegion({
    origin,
    fallbackRegions: [orderedReviews.at(-1)?.region, ...[...regionIds].reverse()],
  });
  const customMatchIds = (trip.savedCustomInterests || []).flatMap((t) => trip.customInterestMatches?.[t] || []);
  const localPicks = (exclude, checkinCounts) =>
    localTagPicks({
      profile: myProfile,
      region,
      excludeIds: exclude,
      checkinCounts,
      interests,
      customMatchIds,
      limit: RESERVE,
    });

  // Ratings saved before per-region tag scores existed: replay them once so
  // those travelers don't restart from zero. Waits for a server-fresh
  // profile so a stale cached copy can't trigger a second replay.
  useEffect(() => {
    if (!user || !profileFresh || !reviews.length) return;
    if ((myProfile?.tagScoresVersion || 0) >= TAG_SCORES_VERSION) return;
    saveRebuiltTagScores(user.uid, rebuildTagScores(reviews), TAG_SCORES_VERSION).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profileFresh, reviews.length, myProfile?.tagScoresVersion]);

  // Ignored picks (tagScores.js settleShownPicks): once a day, any pick shown
  // on an earlier day that you didn't visit, rate or vote on counts as one
  // ignore. Waits for the replay above so it can't overwrite a nudge.
  const settledDayRef = useRef(null);
  useEffect(() => {
    if (!user || !profileFresh) return;
    if ((myProfile?.tagScoresVersion || 0) < TAG_SCORES_VERSION && reviews.length) return;
    const today = localDayKey();
    if (settledDayRef.current === today) return;
    settledDayRef.current = today;
    const voted = Object.values(readLocalFeedback(user.uid) || {}).map((f) => f.landmarkId);
    const result = settleShownPicks(myProfile, { engagedIds: [...excludeIds, ...voted], today });
    if (result.changed) saveSettledPicks(user.uid, result).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profileFresh, myProfile?.tagScoresVersion, reviews.length]);

  useEffect(() => {
    if (!user) {
      setQueue(null);
      return;
    }
    let cancelled = false;
    const key = picksCacheKey(user.uid, ratingsCount, origin, tasteFP);

    // Paint something right away -- the cached list is already synchronous,
    // and the local scorer is free (no network), so neither should leave
    // the carousel blank while /api/mapr-picks (a Claude call) is in
    // flight. getPickFeedback below still reconciles with Firestore and,
    // once it and/or the API respond, replaces this with the real list.
    const instantFb = readLocalFeedback(user.uid);
    const instantPassed = votedIds(instantFb);
    const cachedInstant = readPicksCache(key);
    if (cachedInstant) {
      setQueue(cachedInstant.filter((p) => !instantPassed.includes(p.id) && !excludeIds.includes(p.id)));
    } else {
      try {
        setQueue(localPicks([...excludeIds, ...instantPassed], countsRef.current));
      } catch {
        /* the async path below still runs and will fill the queue */
      }
    }

    (async () => {
      const fb = await getPickFeedback(user.uid);
      if (cancelled) return;
      setFeedback(Object.fromEntries(Object.values(fb).map((f) => [f.landmarkId, f.verdict])));
      const passedIds = votedIds(fb);
      const cached = readPicksCache(key);
      if (cached) {
        setQueue(cached.filter((p) => !passedIds.includes(p.id) && !excludeIds.includes(p.id)));
        return;
      }
      const checkinCounts = region ? await getRegionCheckinCounts(region).catch(() => ({})) : {};
      if (cancelled) return;
      countsRef.current = checkinCounts;
      const fallback = () => localPicks([...excludeIds, ...passedIds], checkinCounts);
      const caps = capMaps(myProfile);
      let next = null;
      try {
        const r = await fetch('/api/mapr-picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region,
            // Every region's scores: the warm start borrows from the others.
            tagScores: myProfile?.tagScores || {},
            tagScoresAt: myProfile?.tagScoresAt || {},
            tagCounts: myProfile?.tagCounts || {},
            capAnswers: caps.answers,
            capNotes: caps.notes,
            checkinCounts,
            interests,
            customMatchIds,
            excludeIds: [...excludeIds, ...passedIds],
            recentReviews: orderedReviews.slice(-10).map((r) => ({
              name: r.landmarkName,
              tier: r.ratingTier,
              categories: r.categories || [],
              highlights: r.highlights || [],
              comment: commentWithLoveNotes(r),
            })),
            tasteIntro: composeTasteIntro(myProfile),
            origin,
          }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.picks?.length) next = data.picks;
      } catch {
        /* offline -- fall through to on-device picks */
      }
      if (cancelled) return;
      // Drop anything checked into since the picks were made. The on-device
      // scorer is a pure function and shouldn't throw, but this section had
      // previously been the one un-guarded step in an otherwise all-caught
      // chain -- if it ever did, the queue was left stuck at null forever
      // (nothing else here sets it), silently hiding the whole carousel for
      // that visit with no retry. Fail to an empty queue instead.
      let list = [];
      try {
        const visited = new Set(excludeIds);
        list = (next || fallback()).filter((p) => !visited.has(p.id)).slice(0, RESERVE);
      } catch {
        /* leave list empty rather than leaving the queue stuck at null */
      }
      setQueue(list);
      if (next) writePicksCache(key, list);
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when the user, their rating count, their coarse location, or
    // anything they've told Mapr about taste changes; the other inputs
    // ride along with those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, ratingsCount, locKey, tasteFP, region]);

  // A pick counts as shown (for ignored-pick tracking) only once at least
  // half of its card has been on screen for a full second, like an ad
  // impression; cards off to the side that you never scrolled to don't count.
  // Only records after the day's settle pass has gone out (Firestore
  // applies one client's writes in order, so the settle's whole-map
  // replace can't clobber these).
  const recordedRef = useRef(new Set());
  const pendingSeenRef = useRef(new Map());
  const flushTimerRef = useRef(null);
  useEffect(() => {
    const track = trackRef.current;
    if (!user || !profileFresh || !track || !queue?.length || typeof IntersectionObserver === 'undefined') return undefined;
    const byKey = new Map(queue.map((p) => [`${p.region}/${p.id}`, p]));
    const markSeen = (p) => {
      const today = localDayKey();
      if (settledDayRef.current !== today) return;
      const key = `${today}:${p.region}/${p.id}`;
      if (recordedRef.current.has(key) || myProfile?.picksShown?.[p.region]?.[p.id] === today) return;
      recordedRef.current.add(key);
      pendingSeenRef.current.set(key, p);
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        const batch = [...pendingSeenRef.current.values()];
        pendingSeenRef.current.clear();
        recordShownPicks(user.uid, batch, today).catch(() => {});
      }, 1500);
    };
    const timers = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = e.target.dataset.pickKey;
          if (e.isIntersecting) {
            if (!timers.has(key)) {
              timers.set(
                key,
                setTimeout(() => {
                  timers.delete(key);
                  const p = byKey.get(key);
                  if (p) markSeen(p);
                }, 1000)
              );
            }
          } else {
            clearTimeout(timers.get(key));
            timers.delete(key);
          }
        }
      },
      { threshold: 0.5 }
    );
    track.querySelectorAll('[data-pick-key]').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, profileFresh, user?.uid, myProfile?.tagScoresVersion]);

  // Which card is in view, for the dots. The dots below only represent the
  // actual picks, but the "+ Rate a Landmark" card sits before them in the
  // track -- offset by one slot so the active dot still matches what's
  // actually in view.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const w = el.firstElementChild.getBoundingClientRect().width + 10;
    setActive(Math.max(0, Math.round(el.scrollLeft / w) - 1));
  };

  // Either vote records your taste and swaps the card for the next pick
  // in the reserve. When the reserve runs dry, the on-device tag scorer (no
  // API call, no cost) tops the queue back up, skipping everything you've
  // already seen, voted on or checked into.
  const vote = (p, verdict) => {
    const nextFeedback = { ...feedback, [p.id]: verdict };
    setFeedback(nextFeedback);
    setPickFeedback({ uid: user.uid, landmark: { id: p.id, region: p.region, name: p.name, categories: p.categories || [] }, verdict, origin });
    // setPickFeedback writes localStorage synchronously before its own first
    // await, so this always sees today's just-added vote -- refreshes the
    // streak the moment a day's 5th vote lands (see streaks.js), instead of
    // waiting for claimedMap to change, which a vote never does.
    reloadBadges();
    setQueue((cur) => {
      let next = (cur || []).filter((x) => x.id !== p.id);
      if (next.length < RESERVE) {
        const seen = new Set([...next.map((x) => x.id), ...Object.keys(nextFeedback), ...excludeIds]);
        const extra = localPicks([...seen], countsRef.current).filter((x) => !seen.has(x.id));
        next = [...next, ...extra].slice(0, RESERVE);
      }
      writePicksCache(picksCacheKey(user.uid, ratingsCount, origin, tasteFP), next);
      return next;
    });
  };

  // The "+ Rate a Landmark" card is always worth showing once signed in --
  // it doesn't depend on Mapr having picks ready yet. Everything else here
  // (the picks themselves, their note, the dots) only makes sense once the
  // queue has something in it.
  if (!user) return null;
  const picks = queue || [];

  return (
    <div className="mapr-picks">
      <div className="taste-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>{'\u{1F525}'} Your Mapr Picks</span>
        <button
          type="button"
          className="tag"
          style={{ fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
          title={`${actionsToday} of ${PICKS_STREAK_THRESHOLD} needed today to secure your streak without a check-in -- more is fine, ${PICKS_STREAK_THRESHOLD} is just the minimum. Tap to see everything you've rated.`}
          onClick={() => navigate('/mapr-ratings')}
        >
          {actionsToday}/{PICKS_STREAK_THRESHOLD} today
        </button>
      </div>
      <p className="taste-card-note" style={{ margin: '0 0 10px' }}>
        {picks.length > 0
          ? `${origin ? 'Near you right now. ' : ''}Tap a card to go there. ${'\u{2713}'} / ${'\u{2715}'} teach Mapr what you like -- not sure yet? Skip it without saying either way.`
          : "Rate a place directly, or check in somewhere to start getting picks."}
      </p>
      <div className="mapr-picks-track" ref={trackRef} onScroll={onScroll}>
        <RateLandmarkSearch />
        {picks.map((p) => {
          return (
            <div key={`${p.region}/${p.id}`} className="mapr-pick" data-pick-key={`${p.region}/${p.id}`}>
              <button type="button" className="mapr-pick-main" onClick={() => navigate(`/landmarks/${p.region}/${p.id}`)}>
                {p.image ? (
                  <img className="mapr-pick-img" src={p.image} alt="" loading="lazy" />
                ) : (
                  <div className="mapr-pick-img mapr-pick-img-blank">{'\u{1F4CD}'}</div>
                )}
                <span className="mapr-pick-match">
                  {p.wildcard ? `${'\u{1F3B2}'} Something new · ` : `${'\u{1F525}'} `}
                  {p.matchPercentage}% match
                </span>
                <span className="mapr-pick-name">{p.name}</span>
                <span className="mapr-pick-sub">{p.oneLineSummary}</span>
              </button>
              <div className="mapr-pick-actions">
                <button type="button" className="mapr-pick-vote no" onClick={() => vote(p, 'no')} title="Not for me">
                  {'\u{2715}'} Not for me
                </button>
                <button
                  type="button"
                  className="mapr-pick-vote unsure"
                  onClick={() => vote(p, 'unsure')}
                  title="Not sure -- doesn't count as a like or a dislike, we'll just ask again later"
                >
                  {'\u{1F937}'} Not sure
                </button>
                <button type="button" className="mapr-pick-vote yes" onClick={() => vote(p, 'yes')} title="I'd go">
                  {'\u{2713}'} I'd go
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
