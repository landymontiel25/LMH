import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandmarkThumb from '../components/LandmarkThumb';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { useRatings } from '../lib/RatingsContext';
import { useTrip } from '../lib/TripContext';
import RegionSearch, { ANY_REGION } from '../components/RegionSearch';
import { mapsDeepLink } from '../lib/routing';
import DiscoveryStatsCard from '../components/DiscoveryStatsCard';

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
  const { myPhotos } = useMyPhotos();
  const { myReviews } = useRatings();
  const { trip } = useTrip();
  const [region, setRegion] = useState(ANY_REGION);
  const [regionOpen, setRegionOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING, stops: [] }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const feedEndRef = useRef(null);
  const regionBoxRef = useRef(null);

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

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

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
      const r = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payload,
          regionId: region.id,
          reviews,
          interests: trip.savedInterests || [],
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error || 'Something went wrong.');

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
              {'\u{1F30D}'} {region.id ? region.name : 'Any city'}
            </button>
            {regionOpen && (
              <div className="chatlab-region-popover">
                <RegionSearch
                  region={region}
                  onSelect={(r) => {
                    setRegion(r);
                    setRegionOpen(false);
                  }}
                  includeAny
                  placeholder="Narrow to a city…"
                />
              </div>
            )}
          </div>
          {totalCost > 0 && <span className="chatlab-cost">{'⚡'} ${totalCost.toFixed(4)}</span>}
        </div>
      </div>

      <DiscoveryStatsCard />

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
