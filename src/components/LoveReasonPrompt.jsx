import { useEffect, useRef, useState } from 'react';
import { useCheckIn } from '../lib/useCheckIn';
import { useAuth } from '../lib/AuthContext';
import { appendLoveNote, getLoveNote } from '../lib/reviews';

// Fires after the 3rd check-in at a landmark, then every 10th after that
// (13th, 23rd, ...) -- see shouldPromptLoveReason in leaderboard.js. Text or
// voice, either works; the answer feeds Mapr's trait matching (maprPicks.js)
// via the review's loveNotes, so future picks match the SPECIFIC reason, not
// just the landmark's category. A repeat trigger offers a one-tap shortcut
// if the last answer is still true, instead of making someone retype it.
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function LoveReasonPrompt() {
  const { loveReasonPrompt, clearLoveReasonPrompt } = useCheckIn();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [previousNote, setPreviousNote] = useState(null);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    setText('');
    setPreviousNote(null);
    setSpeechError(null);
    if (!loveReasonPrompt || !user) return;
    let cancelled = false;
    getLoveNote(user.uid, loveReasonPrompt.landmark.id).then((note) => {
      if (!cancelled) setPreviousNote(note);
    });
    return () => {
      cancelled = true;
    };
  }, [loveReasonPrompt, user]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  if (!loveReasonPrompt) return null;

  const toggleListening = () => {
    if (!SpeechRecognition) {
      setSpeechError("Voice input isn't supported on this browser -- type it instead.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const spoken = e.results[0]?.[0]?.transcript || '';
      setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
    };
    recognition.onerror = () => setSpeechError("Didn't catch that -- try again or type it.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setSpeechError(null);
    setListening(true);
    recognition.start();
  };

  const save = async (note) => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await appendLoveNote(user.uid, loveReasonPrompt.landmark.id, loveReasonPrompt.landmark, note);
    } catch {
      // Best-effort -- a failed save here shouldn't block the app or make
      // it look like the check-in itself failed.
    }
    setSaving(false);
    clearLoveReasonPrompt();
  };

  return (
    <div className="modal-backdrop" onClick={() => !saving && clearLoveReasonPrompt()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{'\u{1F49B}'} Why do you love {loveReasonPrompt.landmark.name}?</h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          You've been here {loveReasonPrompt.visitNumber} times now. Tell Mapr what keeps bringing you back — it
          helps us suggest places for the actual reason, not just the category.
        </p>

        {previousNote && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginBottom: 10, textAlign: 'left' }}
            disabled={saving}
            onClick={() => save(previousNote)}
          >
            {'\u{1F501}'} I still love it for the same reason: <em>"{previousNote}"</em>
          </button>
        )}

        <textarea
          className="rating-comment"
          rows={3}
          maxLength={280}
          placeholder="e.g. the rooftop view at sunset, it's always quiet on weekdays..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className={`btn btn-sm ${listening ? 'btn-danger' : 'btn-ghost'}`}
            onClick={toggleListening}
            disabled={saving}
          >
            {listening ? `${'\u{1F534}'} Listening… tap to stop` : `${'\u{1F3A4}'} Speak instead`}
          </button>
        </div>
        {speechError && (
          <p className="tag tag-error" style={{ display: 'block', marginTop: 8 }}>
            {speechError}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={saving || !text.trim()}
            onClick={() => save(text)}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearLoveReasonPrompt} disabled={saving}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
