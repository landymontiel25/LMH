import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Global "what's that place called?" helper, available from anywhere in the
// app (not just a landmark's own detail page). Answers from the AI, but the
// landmark it links to is always a real entry from our own data -- the
// server-side lookup is grounded in the actual catalog, never invented.
export default function AskLandmarkWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (e) => {
    e?.preventDefault?.();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setAnswer('');
    setMatch(null);
    try {
      const r = await fetch('/api/ask-landmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error || 'Something went wrong.');
      setAnswer(data.answer);
      setMatch(data.match);
    } catch (err) {
      setError(err.message || 'Could not reach the AI. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const viewMatch = () => {
    if (!match) return;
    navigate(`/landmarks/${match.region}/${match.id}`);
    setOpen(false);
  };

  return (
    <>
      {open && (
        <div className="ask-landmark-panel card section ai-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{'✨'} What's that place?</strong>
            <button type="button" className="btn btn-ghost btn-tight" onClick={() => setOpen(false)}>
              {'✕'}
            </button>
          </div>
          <p className="screen-subtitle" style={{ marginTop: 6 }}>
            Describe a landmark and I'll find it — a nickname, a movie it's in, anything.
          </p>
          <form onSubmit={ask} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="text"
              placeholder="e.g. the james bond house"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !question.trim()}>
              {busy ? '…' : 'Ask'}
            </button>
          </form>
          {busy && <p className="screen-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>Thinking…</p>}
          {error && (
            <p className="tag tag-error" style={{ display: 'block', marginTop: 10, marginBottom: 0 }}>
              {error}
            </p>
          )}
          {answer && (
            <>
              <div className="ai-answer">{answer}</div>
              {match && (
                <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={viewMatch}>
                  View {match.name} {'→'}
                </button>
              )}
            </>
          )}
          <p className="ai-disclaimer">AI can be wrong — double-check before you go.</p>
        </div>
      )}
      <button
        type="button"
        className="ask-landmark-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask what a landmark is called"
      >
        {'✨'}
      </button>
    </>
  );
}
