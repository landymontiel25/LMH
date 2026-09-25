import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandmarkThumb from '../components/LandmarkThumb';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { useRatings } from '../lib/RatingsContext';
import { useTrip } from '../lib/TripContext';
import MultiRegionSearch from '../components/MultiRegionSearch';
import { mapsDeepLink } from '../lib/routing';
import { computeTasteConfidence, hasInsiderMode } from '../lib/tasteProfile';
import { composeTasteIntro, baselineToSyntheticReviews } from '../lib/tasteQuestions';
import { logPlanningEvent } from '../lib/timeSaved';
import DiscoveryStatsCard from '../components/DiscoveryStatsCard';
import TasteProfileCard from '../components/TasteProfileCard';
import TasteNudgeCard from '../components/TasteNudgeCard';

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

const GREETING =
  "Hey — I'm Mapr. Tell me what you're up for: a vibe, a time budget, an interest, whatever. I'll line up real stops.";

// The app's home screen -- the one thing people open every day. A live
// chat instead of a form: you type what you want in your own words, the AI
// replies conversationally, and it drops in real catalog stops when it has
// enough to go on. Follow-ups ("more nightlife", "skip that one") refine
// the same thread instead of starting over. Reads the same rating history
// (myReviews) and saved interests Mapr Picks does, so it's never guessing
// at a traveler's taste from nothing when it already knows.
export default function Mapr() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { myProfile } = useFriends();
  const { myPhotos } = useMyPhotos();
  const { myReviews } = useRatings();
  const { trip } = useTrip();
  // Several cities at once ("Philly or NYC this weekend") -- empty means
  // "any city", same meaning ANY_REGION used to carry as a single value.
  const [regions, setRegions] = useState([]);
  const [regionOpen, setRegionOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING, stops: [] }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const feedEndRef = useRef(null);
  const regionBoxRef = useRef(null);

  const hasTasteInfo = !!(myProfile?.tasteIntro || (myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length));
  const showTasteNudge = !!user && !hasTasteInfo && !nudgeDismissed && !isTasteNudgeDismissed(user.uid);
  const dismissNudge = () => {
    if (user) dismissTasteNudge(user.uid);
    setNudgeDismissed(true);
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

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

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
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
      const startedAt = performance.now();
      const r = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payload,
          regionIds: regions.map((r) => r.id),
          reviews,
          interests: trip.savedInterests || [],
          tasteIntro: composeTasteIntro(myProfile),
          insiderMode,
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
      setMessages((cur) => [...cur, { role: 'assistant', text: data.reply, stops, raw }]);
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
