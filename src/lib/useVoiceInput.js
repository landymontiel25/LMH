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
      setError("Voice input isn't supported on this browser -- type it instead.");
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
    recognition.onerror = () => setError("Didn't catch that -- try again or type it.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  };

  return { listening, error, toggleListening };
}
