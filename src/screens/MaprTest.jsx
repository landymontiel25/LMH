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
import TripPlannerCard from '../components/TripPlannerCard';
import '../styles/maprTest.css';

// A visual-design preview of a Mapr redesign concept, on its own throwaway
// tab so it can sit next to the real Mapr screen without touching it. This
// is NOT a mockup -- every hook, handler, and shared component below
// (send(), the taste nudge, DiscoveryStatsCard, TasteProfileCard,
// TripPlannerCard, the region picker) is copied verbatim from Mapr.jsx.
// Only the JSX layout and maprTest.css's styling differ. Remove this file,
// its route, its BottomNav entry, and maprTest.css once the design
// question is settled either way -- at that point either fold this markup
// into Mapr.jsx for real, or delete all of it.

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

// The quick-ask pills from the reference design -- each just fires a real
// send() with a canned prompt, the same way TripPlannerCard's "Plan My
// Trip" already sends a programmatic message.
const QUICK_PROMPTS = [
  { icon: '\u{1F37D}\u{FE0F}', label: 'Dinner tonight', text: "What's good for dinner tonight?" },
  { icon: '\u{1F5FA}\u{FE0F}', label: 'A full day itinerary', text: 'Plan a full day for me today.' },
  { icon: '\u{1F333}', label: 'Outdoors', text: 'Suggest something outdoors nearby.' },
  { icon: '✨', label: 'Hidden gems', text: "Show me some hidden gems, nothing touristy." },
  { icon: '\u{1F3F7}\u{FE0F}', label: 'Under $50', text: 'Suggest something fun under $50.' },
  { icon: '\u{1F90D}', label: 'Keep it lowkey', text: 'I want something relaxed and lowkey right now.' },
];

const SIDEBAR_LINKS = [
  { to: '/landmarks', label: 'Landmarks', icon: '\u{1F4CD}' },
  { to: '/', label: 'Map', icon: '\u{1F5FA}\u{FE0F}' },
  { to: '/itinerary', label: 'Itinerary', icon: '\u{1F4C5}' },
  { to: '/profile', label: 'Profile', icon: '\u{1F464}' },
];

export default function MaprTest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { myProfile, profileFresh, myUsername } = useFriends();
  const { myPhotos } = useMyPhotos();
  const { myReviews } = useRatings();
  const { trip } = useTrip();
  const [regions, setRegions] = useState([]);
  const [regionOpen, setRegionOpen] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING, stops: [] }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const feedEndRef = useRef(null);
  const regionBoxRef = useRef(null);

  const hasTasteInfo = !!(myProfile?.tasteIntro || (myProfile?.tasteBaseline && Object.keys(myProfile.tasteBaseline).length));
  const showTasteNudge = !!user && profileFresh && !hasTasteInfo && !nudgeDismissed && !isTasteNudgeDismissed(user.uid);
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

  const send = async (e, overrideText) => {
    e?.preventDefault();
    const text = (overrideText ?? draft).trim();
    if (!text || busy) return;

    if (showTasteNudge) dismissNudge();

    const history = [...messages, { role: 'user', text }];
    setMessages(history);
    setDraft('');
    setBusy(true);

    try {
      const payload = history
        .filter((m) => m.role === 'user' || m.raw)
        .map((m) => ({ role: m.role, content: m.role === 'assistant' ? m.raw : m.text }));

      const reviews = Object.values(myReviews)
        .filter((r) => r.ratingTier)
        .map((r) => ({
          name: r.landmarkName,
          tier: r.ratingTier,
          categories: r.categories || [],
          highlights: r.highlights || [],
          comment: [r.comment, ...(r.loveNotes || [])].filter(Boolean).join('. '),
        }));
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
      if (user && data.stops?.length) {
        logPlanningEvent(user.uid, { generationMs, stopsCount: data.stops.length }).catch(() => {});
      }

      const stops = data.stops || [];
      const raw = data.reply + (stops.length ? `\n(Suggested: ${stops.map((s) => s.name).join(', ')})` : '');
      setMessages((cur) => [...cur, { role: 'assistant', text: data.reply, stops, raw }]);
      if (data.cost) setTotalCost((c) => c + data.cost);
    } catch (err) {
      setMessages((cur) => [...cur, { role: 'assistant', text: err.message || 'Signal lost — try again?', stops: [], error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const greetingName = myUsername || user?.displayName?.split(' ')[0] || 'there';
  const initials = (myUsername || user?.displayName || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <div className="mtest">
      <div className="mtest-banner">
        {'\u{1F9EA}'} Test tab — the real Mapr chat, new visual skin. Nothing else has changed.
      </div>
      <header className="mtest-header">
        <div className="mtest-logo">Mapr</div>
        <div className="mtest-region" ref={regionBoxRef}>
          <button type="button" className="mtest-location-pill" onClick={() => setRegionOpen((o) => !o)}>
            {'\u{1F4CD}'}{' '}
            {regions.length === 0
              ? 'Any city'
              : regions.length === 1
              ? regions[0].name
              : `${regions[0].name} +${regions.length - 1}`}{' '}
            {'▾'}
          </button>
          {regionOpen && (
            <div className="mtest-region-popover">
              <MultiRegionSearch
                selectedIds={regions.map((r) => r.id)}
                onToggle={toggleRegion}
                onClearAll={() => setRegions([])}
                placeholder="Add a city…"
              />
            </div>
          )}
        </div>
        <div className="mtest-header-spacer" />
        {totalCost > 0 && <span className="mtest-cost">{'⚡'} ${totalCost.toFixed(4)}</span>}
        <div className="mtest-avatar">{initials}</div>
      </header>

      <div className="mtest-body">
        <nav className="mtest-sidebar">
          <span className="mtest-nav-item active">{'\u{1F9ED}'} Plan</span>
          {SIDEBAR_LINKS.map((l) => (
            <button key={l.to} type="button" className="mtest-nav-item" onClick={() => navigate(l.to)}>
              {l.icon} {l.label}
            </button>
          ))}
          <div className="mtest-sidebar-footer">Test tab — real navigation, new look.</div>
        </nav>

        <main className="mtest-main">
          <div className="mtest-hero">
            <div className="mtest-orb" />
            <h1>Hey {greetingName},</h1>
            <p className="mtest-hero-sub">What are you in the mood for?</p>
            <form className="mtest-search" onSubmit={send}>
              <span>{'✨'}</span>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Tell Mapr what you're looking for…"
                maxLength={500}
                autoComplete="off"
                autoCapitalize="off"
              />
              <button type="submit" className="mtest-send" disabled={busy || !draft.trim()} aria-label="Send">
                {'\u{2191}'}
              </button>
            </form>
            <div className="mtest-pills">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.label} type="button" disabled={busy} onClick={() => send(null, p.text)}>
                  {p.icon} {p.label}
                </button>
              ))}
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
            <button type="button" className="mtest-plan-btn" onClick={() => setShowPlanner(true)}>
              {'\u{1F9ED}'} Plan Your Trip
            </button>
          )}

          {showTasteNudge && <TasteNudgeCard onDone={dismissNudge} onDismiss={dismissNudge} />}

          <DiscoveryStatsCard />
          <TasteProfileCard />

          <div className="mtest-section">
            <div className="mtest-section-title">Conversation</div>
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
          </div>
        </main>
      </div>
    </div>
  );
}
