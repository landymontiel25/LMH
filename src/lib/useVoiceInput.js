import { useEffect, useRef, useState } from 'react';

// Shared voice-to-text for every place in the app someone can type --
// there's no legitimate way to embed a third-party dictation app (e.g.
// Wispr Flow) inside a web page: it's a closed native/desktop tool with no
// public embeddable API. This is our own, built on the browser's Web
// Speech API, which already ships in Chrome/Edge/Safari with no key, no
// paid plan, and no install. `onResult` gets called with each finished
// utterance's transcript -- callers append it into whatever they're
// editing (a textarea, a chat composer, anything).
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceInputSupported = !!SpeechRecognition;

// Firefox ships neither SpeechRecognition nor webkitSpeechRecognition at
// all (voiceInputSupported catches that), but even where the API exists,
// recognition.onerror's e.error names the actual failure -- surfacing that
// instead of one generic message is the difference between "it's broken"
// and "you need to allow the mic".
function messageForError(code) {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return "Mic access is blocked -- check your browser's site permissions and allow the microphone.";
    case 'no-speech':
      return "Didn't hear anything -- try again a little closer to the mic.";
    case 'audio-capture':
      return 'No microphone found on this device.';
    case 'network':
      return 'Voice input needs a network connection -- try again, or type it instead.';
    default:
      return "Didn't catch that -- try again or type it.";
  }
}

export function useVoiceInput(onResult) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognition) {
      setError("Voice input isn't supported on this browser -- try Chrome, Edge, or Safari, or type it instead.");
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
      if (spoken) onResultRef.current(spoken);
    };
    recognition.onerror = (e) => setError(messageForError(e?.error));
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      // Most commonly "already started" from a fast double-tap -- the
      // previous instance is still winding down. Never leave the button
      // stuck showing "Listening..." for a start that didn't actually happen.
      setListening(false);
      setError("Couldn't start listening -- try tapping again.");
    }
  };

  return { listening, error, toggleListening };
}
