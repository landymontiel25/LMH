import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles as SparklesIcon, X as XIcon } from 'lucide-react';

// Global AI helper, available from anywhere in the app (not just a landmark's
// own detail page): identifies a place from a vague description, answers
// travel questions, or answers "how do I..." questions about the app itself.
// The landmark it links to is always a real entry from our own data -- the
// server-side lookup is grounded in the actual catalog, never invented.
export default function AskLandmarkWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
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
      const r = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error || 'Something went wrong.');
      setAnswer(data.answer);
      setMatch(data.match);
      // Clear the box and refocus so the next question is one tap away — no more
      // selecting and deleting the previous question.
      setQuestion('');
      inputRef.current?.focus();
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
            <strong><SparklesIcon aria-hidden="true" /> Ask AI</strong>
            <button type="button" className="btn btn-ghost btn-tight" onClick={() => setOpen(false)}>
              <XIcon aria-hidden="true" />
            </button>
          </div>
          <p className="screen-subtitle" style={{ marginTop: 6 }}>
            Ask me anything about a landmark, a city, or how to use the app — or describe a place and I'll find it.
          </p>
          <form onSubmit={ask} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. how do I complete onboarding? · best gelato in Milan?"
                value={question}
                maxLength={300}
                onChange={(e) => setQuestion(e.target.value)}
                style={{ width: '100%', paddingRight: question ? 34 : undefined }}
                autoFocus
              />
              {question && (
                <button
                  type="button"
                  onClick={() => {
                    setQuestion('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear"
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-parchment-dim)',
                    fontSize: '1rem',
                    lineHeight: 1,
                    padding: 6,
                  }}
                >
                  <XIcon aria-hidden="true" />
                </button>
              )}
            </div>
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
        <SparklesIcon aria-hidden="true" />
      </button>
    </>
  );
}
