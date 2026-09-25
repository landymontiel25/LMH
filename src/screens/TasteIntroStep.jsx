import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { saveTasteIntro } from '../lib/friends';

// Optional onboarding step: "tell Mapr what you already love," in your own
// words -- "I love racing, steak, pickleball, the boat... I like fancy,
// luxurious things." Fed to the AI verbatim (see api/plan-ai.js and
// api/mapr-picks.js's TASTE INTRO section) rather than parsed into
// categories, so it can shape suggestions from day one instead of waiting
// for a first rating. Entirely optional -- Skip moves on with nothing saved,
// and the same text can be added or edited anytime later from Settings.
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function TasteIntroStep({ onDone }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

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

  const saveAndContinue = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await saveTasteIntro(user.uid, text);
    } catch {
      // Best-effort -- never block onboarding on this write failing.
    }
    setSaving(false);
    onDone();
  };

  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F9E9}'}</span> Tell Mapr what you love
      </h1>
      <p className="screen-subtitle">
        Optional, but it helps -- give Mapr a quick overview of your taste and it can start suggesting well before
        your first rating. Text or voice, whatever's easier.
      </p>
      <p className="screen-subtitle" style={{ marginTop: -10, fontSize: '0.78rem' }}>
        For example: "I love racing, steak, pickleball, the boat... I like fancy, luxurious things."
      </p>

      <textarea
        className="rating-comment"
        rows={4}
        maxLength={600}
        placeholder="What are you already into?"
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

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 20 }}
        disabled={saving || !text.trim()}
        onClick={saveAndContinue}
      >
        {saving ? 'Saving…' : `Continue ${'\u{2192}'}`}
      </button>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onDone} disabled={saving}>
        Skip for now
      </button>
    </div>
  );
}
