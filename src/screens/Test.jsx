import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { INTERESTS } from '../data/regions';
import LandmarkThumb from '../components/LandmarkThumb';
import AddInterestChip from '../components/AddInterestChip';
import RegionSearch, { ANY_REGION } from '../components/RegionSearch';

// Prototype: instead of chips and multi-screen trip setup, describe what you
// want in one sentence and get a short generated plan back. Tests the
// specific bet that people will type an ask ("3 hours, food and history, not
// touristy") and want a generated answer, not just Q&A about one landmark.
export default function Test() {
  const navigate = useNavigate();
  const [request, setRequest] = useState('');
  const [region, setRegion] = useState(ANY_REGION);
  // The order of this list IS the priority order sent to the AI -- earlier
  // entries win when the catalog can't satisfy everything. Move buttons on
  // each row let you rearrange it; toggling a chip or the × removes it.
  const [selected, setSelected] = useState([]); // [{ key, label }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const isSelected = (key) => selected.some((s) => s.key === key);

  const toggleFixed = (i) => {
    setSelected((cur) => (cur.some((s) => s.key === i.id) ? cur.filter((s) => s.key !== i.id) : [...cur, { key: i.id, label: i.label }]));
  };

  const addCustom = (text) => {
    setSelected((cur) => (cur.some((s) => s.key === text) ? cur : [...cur, { key: text, label: text, custom: true }]));
  };

  const removeSelected = (key) => {
    setSelected((cur) => cur.filter((s) => s.key !== key));
  };

  const moveSelected = (index, dir) => {
    setSelected((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const plan = async (e) => {
    e.preventDefault();
    const text = request.trim();
    if (!text && selected.length === 0) return;
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text, regionId: region.id, interests: selected.map((s) => s.label) }),
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
            <RegionSearch region={region} onSelect={setRegion} includeAny />
          </div>

          <div className="field">
            <label>What are you interested in? (optional)</label>
            <div className="chip-grid">
              {INTERESTS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`chip ${isSelected(i.id) ? 'selected' : ''}`}
                  onClick={() => toggleFixed(i)}
                >
                  <span className="chip-icon">{i.icon}</span>
                  <span>{i.label}</span>
                </button>
              ))}
              <AddInterestChip existing={selected.map((s) => s.label)} onAdd={addCustom} />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="field">
              <label>Priority — top matters most</label>
              {selected.map((s, i) => (
                <div
                  key={s.key}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginTop: 6 }}
                >
                  <span style={{ flex: 1 }}>
                    {i + 1}. {s.label}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tight"
                    disabled={i === 0}
                    onClick={() => moveSelected(i, -1)}
                    aria-label={`Move ${s.label} up`}
                  >
                    {'↑'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tight"
                    disabled={i === selected.length - 1}
                    onClick={() => moveSelected(i, 1)}
                    aria-label={`Move ${s.label} down`}
                  >
                    {'↓'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tight"
                    onClick={() => removeSelected(s.key)}
                    aria-label={`Remove ${s.label}`}
                  >
                    {'✕'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <label>Anything else? (optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. I have 3 hours, nothing touristy"
              value={request}
              maxLength={500}
              onChange={(e) => setRequest(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
              autoCapitalize="off"
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={busy || (!request.trim() && selected.length === 0)}>
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
