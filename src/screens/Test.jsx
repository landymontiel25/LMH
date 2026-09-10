import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REGIONS, INTERESTS } from '../data/regions';
import LandmarkThumb from '../components/LandmarkThumb';
import OtherInterestChip from '../components/OtherInterestChip';

const ANY_REGION = { id: '', name: 'Any region', tagline: 'Search everywhere' };

// Type-to-search region picker (not a card list to tap through, not a plain
// <select> to scroll) -- matches the "type where you are" ask.
function RegionSearch({ region, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const options = [ANY_REGION, ...REGIONS];
  const matches = q
    ? options.filter((r) => r.name.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || r.country?.toLowerCase().includes(q))
    : options;

  return (
    <div className="autocomplete" ref={ref}>
      <input
        type="text"
        placeholder="Search for a region…"
        value={open ? query : region.name}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="autocomplete-list">
          {matches.map((r) => (
            <button
              type="button"
              key={r.id || 'any'}
              className="autocomplete-item"
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              <span className="autocomplete-primary">{r.name}</span>
              {r.tagline && <span className="autocomplete-secondary">{r.tagline}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Prototype: instead of chips and multi-screen trip setup, describe what you
// want in one sentence and get a short generated plan back. Tests the
// specific bet that people will type an ask ("3 hours, food and history, not
// touristy") and want a generated answer, not just Q&A about one landmark.
export default function Test() {
  const navigate = useNavigate();
  const [request, setRequest] = useState('');
  const [region, setRegion] = useState(ANY_REGION);
  const [interests, setInterests] = useState([]);
  const [customInterest, setCustomInterest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const toggleInterest = (id) => {
    setInterests((cur) => (cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id]));
  };

  const plan = async (e) => {
    e.preventDefault();
    const text = request.trim();
    const interestLabels = [
      ...INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.label),
      ...(customInterest.trim() ? [customInterest.trim()] : []),
    ];
    if (!text && interestLabels.length === 0) return;
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text, regionId: region.id, interests: interestLabels }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error || 'Something went wrong.');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not reach the AI. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F9EA}'}</span> Test
      </h1>
      <p className="screen-subtitle">
        Tell it what you're in the mood for, and it builds a short plan from real landmarks — no trip
        setup, no clicking through screens.
      </p>

      <div className="card" style={{ padding: 16 }}>
        <form onSubmit={plan}>
          <div className="field">
            <label>Region</label>
            <RegionSearch region={region} onSelect={setRegion} />
          </div>

          <div className="field">
            <label>What are you interested in? (optional)</label>
            <div className="chip-grid">
              {INTERESTS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`chip ${interests.includes(i.id) ? 'selected' : ''}`}
                  onClick={() => toggleInterest(i.id)}
                >
                  <span className="chip-icon">{i.icon}</span>
                  <span>{i.label}</span>
                </button>
              ))}
              <OtherInterestChip value={customInterest} onChange={setCustomInterest} />
            </div>
          </div>

          <div className="field">
            <label>Anything else? (optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. I have 3 hours, nothing touristy"
              value={request}
              maxLength={500}
              onChange={(e) => setRequest(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={busy || (!request.trim() && interests.length === 0 && !customInterest.trim())}
          >
            {busy ? 'Planning…' : 'Plan it'}
          </button>
        </form>

        {error && (
          <p className="tag tag-error" style={{ display: 'block', marginTop: 10, marginBottom: 0 }}>
            {error}
          </p>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            {result.intro && <p style={{ marginTop: 0 }}>{result.intro}</p>}
            {result.stops.length === 0 && !result.intro && (
              <p style={{ color: 'var(--color-parchment-dim)' }}>Nothing matched that — try rephrasing.</p>
            )}
            {result.stops.map((stop, i) => (
              <button
                key={`${stop.region}/${stop.id}`}
                type="button"
                className="card itin-city-card"
                style={{ marginTop: 8, width: '100%', textAlign: 'left' }}
                onClick={() => navigate(`/landmarks/${stop.region}/${stop.id}`)}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <LandmarkThumb landmark={stop} size={44} />
                  <div>
                    <h3 style={{ margin: 0 }}>
                      {i + 1}. {stop.name}
                    </h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-parchment-dim)', fontSize: '0.85rem' }}>
                      {stop.reason}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
