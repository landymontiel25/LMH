import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LandmarkThumb from '../components/LandmarkThumb';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { useRatings } from '../lib/RatingsContext';
import { useTrip } from '../lib/TripContext';
import { useGeo } from '../lib/GeoContext';
import { effectiveTagScores, pickRegion } from '../lib/tagScores';
import { useMaprChat } from '../lib/MaprChatContext';
import MultiRegionSearch from '../components/MultiRegionSearch';
import { mapsDeepLink } from '../lib/routing';
import { computeTasteConfidence, hasInsiderMode } from '../lib/tasteProfile';
import { composeTasteIntro, baselineToSyntheticReviews } from '../lib/tasteQuestions';
import { logPlanningEvent } from '../lib/timeSaved';
import DiscoveryStatsCard from '../components/DiscoveryStatsCard';
import TasteProfileCard from '../components/TasteProfileCard';
import TasteNudgeCard from '../components/TasteNudgeCard';
import TripPlannerCard from '../components/TripPlannerCard';
import { authHeaders } from '../lib/apiAuth';

// "You haven't told Mapr what you like yet" nudge -- shown once (per
// device/account) until either dismissed outright or satisfied by actually
// talking to Mapr or filling in Settings' taste intro. Per-uid so signing
// into a different account doesn't inherit another account's dismissal.
const TASTE_NUDGE_DISMISSED_PREFIX = 'landmarkhunters.tasteNudgeDismissed.';
function isTasteNudgeDismissed(uid) {
  try {
    return localStorage.getItem(`${TASTE_NUDGE_DISMISSED_PREFIX}${uid}`) === '1';
  } catch {
    return false;
  }
}
function dismissTasteNudge(uid) {
  try {
    localStorage.setItem(`${TASTE_NUDGE_DISMISSED_PREFIX}${uid}`, '1');
  } catch {
    /* storage full/disabled -- non-fatal, nudge just won't stay dismissed */
  }
}

// The app's home screen -- the one thing people open every day. A live
// chat instead of a form: you type what you want in your own words, the AI
// replies conversationally, and it drops in real catalog stops when it has
// enough to go on. Follow-ups ("more nightlife", "skip that one") refine
// the same thread instead of starting over. Reads the same rating history
// (myReviews) and saved interests Mapr Picks does, so it's never guessing
// at a traveler's taste from nothing when it already knows.
export default function Mapr() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { myProfile, profileFresh } = useFriends();
  const { myPhotos } = useMyPhotos();
  const { myReviews } = useRatings();
  const { trip } = useTrip();
  const { coords } = useGeo();
  // Chat thread, city picks, planner-open state, cost total and busy all
  // live in MaprChatContext (above the router in App.jsx) instead of here
  // -- this screen unmounts like any other route the moment you tap over
  // to another tab, so anything kept as local state here was silently
  // wiped the moment you stepped away to check a landmark and came back.
  const {
    messages,
    setMessages,
    draft,
    setDraft,
    regions,
    setRegions,
    showPlanner,
    setShowPlanner,
    totalCost,
    setTotalCost,
    busy,
    setBusy,
  } = useMaprChat();
  const [regionOpen, setRegionOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const feedEndRef = useRef(null);
  const regionBoxRef = useRef(null);

  const hasTasteInfo = !!(myProfile?.tasteIntro || (myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length));
  // profileFresh: don't nag "you haven't told Mapr what you like" off the
  // localStorage prefill -- until the real server read lands, the profile
  // can look empty when it isn't.
  const showTasteNudge = !!user && profileFresh && !hasTasteInfo && !nudgeDismissed && !isTasteNudgeDismissed(user.uid);
  const dismissNudge = () => {
    if (user) dismissTasteNudge(user.uid);
    setNudgeDismissed(true);
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  // Consume the "open the planner" nav state once so it doesn't reopen on
  // every re-render or if you navigate back to Mapr again later. showPlanner
  // itself now lives in MaprChatContext (so it survives leaving and
  // returning to this tab on its own) -- this effect only ever turns it ON
  // when arriving via that specific nav state, never off, so it doesn't
  // clobber a planner you already had open from before.
  useEffect(() => {
    if (location.state?.openTripPlanner) {
      setShowPlanner(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (regionBoxRef.current && !regionBoxRef.current.contains(e.target)) setRegionOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRegion = (r) => {
    setRegions((cur) => (cur.some((c) => c.id === r.id) ? cur.filter((c) => c.id !== r.id) : [...cur, r]));
  };

  // overrideText lets the trip planner card (or anything else) send a
  // message programmatically without going through the composer input.
  const send = async (e, overrideText) => {
    e?.preventDefault();
    const text = (overrideText ?? draft).trim();
    if (!text || busy) return;

    // Actually talking to Mapr about what you're into satisfies the taste
    // nudge just as well as filling in the Settings field does -- that's
    // the whole point of the nudge, so don't ask again once it's happened.
    if (showTasteNudge) dismissNudge();

    const history = [...messages, { role: 'user', text }];
    setMessages(history);
    setDraft('');
    setBusy(true);

    try {
      // The AI only needs its own prior replies (not the canned local greeting)
      // plus every turn you typed, to keep following the thread.
      const payload = history
        .filter((m) => m.role === 'user' || m.raw)
        .map((m) => ({ role: m.role, content: m.role === 'assistant' ? m.raw : m.text }));

      // Same rating history Mapr Picks reads (myReviews/savedInterests) --
      // this chat should never have to say "I don't have any record of
      // your interests" when Profile clearly does.
      const reviews = Object.values(myReviews)
        .filter((r) => r.ratingTier)
        .map((r) => ({
          name: r.landmarkName,
          tier: r.ratingTier,
          categories: r.categories || [],
          highlights: r.highlights || [],
          // Folds in loveNotes -- the "why do you love this place" answers
          // from repeat visits -- alongside the rating's own comment.
          comment: [r.comment, ...(r.loveNotes || [])].filter(Boolean).join('. '),
        }));
      // Insider Mode (src/lib/tasteProfile.js): unlocked once Mapr's own
      // leave-one-out predictions are actually confident about this
      // traveler's taste -- see computeTasteConfidence for what "confident"
      // means here. Recomputed per-send rather than read from a stored
      // value, so it's never stale. Includes the taste baseline picks
      // alongside real ratings, same as TasteProfileCard's own score.
      const confidenceInputs = [
        ...reviews,
        ...baselineToSyntheticReviews(myProfile?.tasteBaseline, myProfile?.tasteBaselineCategoryNotes),
      ];
      const insiderMode = hasInsiderMode(computeTasteConfidence(confidenceInputs).confidence);
      // Learned per-category scores for the chat's cities (or wherever the
      // traveler is), plus the local clock, so the server can weigh
      // categories by the time a plan is for (tagScores.js TIME_SLOTS).
      const tagRegions = regions.length
        ? regions.map((reg) => reg.id)
        : [pickRegion({ origin: coords, fallbackRegions: [trip.activeRegion] })].filter(Boolean);
      const tagScoreSummary = Object.fromEntries(
        tagRegions
          .slice(0, 3)
          .map((id) => [
            id,
            Object.fromEntries(
              Object.entries(effectiveTagScores(myProfile, id))
                .map(([tag, v]) => [tag, Math.round(v)])
                .filter(([, v]) => v !== 0)
            ),
          ])
          .filter(([, m]) => Object.keys(m).length)
      );
      const now = new Date();
      const startedAt = performance.now();
      const r = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          messages: payload,
          regionIds: regions.map((r) => r.id),
          reviews,
          interests: trip.savedInterests || [],
          tasteIntro: composeTasteIntro(myProfile),
          insiderMode,
          tagScoreSummary,
          localNow: {
            day: now.getDay(),
            hour: now.getHours(),
            label: now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
          },
        }),
      });
      const generationMs = performance.now() - startedAt;
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error || 'Something went wrong.');
      // Time-saved tracking (src/lib/timeSaved.js): real generation time for
      // this reply, logged only when it actually produced stops -- a plain
      // back-and-forth reply with no stops didn't save anyone planning time.
      if (user && data.stops?.length) {
        logPlanningEvent(user.uid, { generationMs, stopsCount: data.stops.length }).catch(() => {});
      }

      const stops = data.stops || [];
      // A compact record of what this reply actually said, fed back as this
      // turn's "content" next time so the AI remembers its own picks.
      const raw = data.reply + (stops.length ? `\n(Suggested: ${stops.map((s) => s.name).join(', ')})` : '');
      // Short tappable answers to a clarifying question ("Something new" /
      // "Repeat a favorite") -- tapping one just sends that exact text, the
      // same as typing it, so the traveler never has to type a one-word
      // answer by hand.
      setMessages((cur) => [...cur, { role: 'assistant', text: data.reply, stops, raw, quickReplies: data.quickReplies || [] }]);
      if (data.cost) setTotalCost((c) => c + data.cost);
    } catch (err) {
      setMessages((cur) => [...cur, { role: 'assistant', text: err.message || 'Signal lost — try again?', stops: [], error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chatlab">
      <div className="chatlab-header">
        <div className="chatlab-orb" />
        <div className="chatlab-header-text">
          <h1 className="chatlab-title">Mapr</h1>
          <p className="chatlab-tagline">Live trip planning</p>
        </div>
        <div className="chatlab-header-right">
          <div className="chatlab-region" ref={regionBoxRef}>
            <button type="button" className="chatlab-region-pill" onClick={() => setRegionOpen((o) => !o)}>
              {'\u{1F30D}'}{' '}
              {regions.length === 0
                ? 'Any city'
                : regions.length === 1
                ? regions[0].name
                : `${regions[0].name} +${regions.length - 1}`}
            </button>
            {regionOpen && (
              <div className="chatlab-region-popover">
                <MultiRegionSearch
                  selectedIds={regions.map((r) => r.id)}
                  onToggle={toggleRegion}
                  onClearAll={() => setRegions([])}
                  placeholder="Add a city…"
                />
              </div>
            )}
          </div>
          {totalCost > 0 && <span className="chatlab-cost">{'⚡'} ${totalCost.toFixed(4)}</span>}
        </div>
      </div>

      {showPlanner ? (
        <TripPlannerCard
          regions={regions}
          onToggleRegion={toggleRegion}
          onClearRegions={() => setRegions([])}
          onClose={() => setShowPlanner(false)}
          onPlan={(message) => {
            setShowPlanner(false);
            send(null, message);
          }}
        />
      ) : (
        <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 12 }} onClick={() => setShowPlanner(true)}>
          {'\u{1F9ED}'} Plan Your Trip
        </button>
      )}

      {showTasteNudge && <TasteNudgeCard onDone={dismissNudge} onDismiss={dismissNudge} />}

      <DiscoveryStatsCard />
      <TasteProfileCard />

      <div className="chatlab-feed">
        {messages.map((m, i) => (
          <div key={i} className={`chatlab-msg ${m.role}`}>
            {m.role === 'assistant' && <div className="chatlab-avatar" />}
            <div className={`chatlab-bubble ${m.error ? 'error' : ''}`}>
              <p>{m.text}</p>
              {m.stops?.length > 0 && (
                <div className="chatlab-stops">
                  {m.stops.map((stop) =>
                    stop.external ? (
                      <div key={`ext-${stop.url}`} className="chatlab-stop chatlab-stop-external">
                        <div className="chatlab-stop-globe">{'\u{1F310}'}</div>
                        <div className="chatlab-stop-text">
                          <strong>
                            {stop.name}
                            {stop.place ? ` — ${stop.place}` : ''}
                          </strong>
                          <span>{stop.reason}</span>
                          <div className="chatlab-stop-links">
                            <a href={mapsDeepLink(`${stop.name} ${stop.place}`)} target="_blank" rel="noreferrer">
                              Directions
                            </a>
                            <a href={stop.url} target="_blank" rel="noreferrer">
                              Source {'↗'}
                            </a>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={`${stop.region}/${stop.id}`}
                        type="button"
                        className="chatlab-stop"
                        onClick={() => navigate(`/landmarks/${stop.region}/${stop.id}`)}
                      >
                        <LandmarkThumb landmark={stop} size={44} myPhoto={myPhotos[stop.id]?.[0]} />
                        <div className="chatlab-stop-text">
                          <strong>{stop.name}</strong>
                          <span>{stop.reason}</span>
                        </div>
                      </button>
                    )
                  )}
                </div>
              )}
              {/* Only on the latest message, and only while nothing else is
                  in flight -- an older question's quick replies would be
                  answering a turn the conversation has already moved past. */}
              {m.quickReplies?.length > 0 && i === messages.length - 1 && !busy && (
                <div className="chatlab-quick-replies">
                  {m.quickReplies.map((qr) => (
                    <button key={qr} type="button" onClick={() => send(null, qr)}>
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chatlab-msg assistant">
            <div className="chatlab-avatar" />
            <div className="chatlab-bubble chatlab-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={feedEndRef} />
      </div>

      <div className="action-bar-spacer" />
      <form className="fixed-action-bar chatlab-composer" onSubmit={send}>
        <div className="fixed-action-bar-inner chatlab-composer-inner">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell it what you're up for…"
            maxLength={500}
            autoComplete="off"
            autoCapitalize="off"
          />
          <button type="submit" className="chatlab-send" disabled={busy || !draft.trim()} aria-label="Send">
            {'\u{27A4}'}
          </button>
        </div>
      </form>
    </div>
  );
}
