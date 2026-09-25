import { useVoiceInput } from '../lib/useVoiceInput';

// Drop into any screen with a text field: `onText` gets called with each
// spoken utterance's transcript, same shape as a controlled input's onChange
// text. Callers decide how to merge it in (usually appending to whatever's
// already typed). See useVoiceInput.js for why this is our own build
// rather than a third-party dictation app.
export default function VoiceInputButton({ onText, disabled, label = 'Speak instead' }) {
  const { listening, error, toggleListening } = useVoiceInput(onText);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        className={`btn btn-sm ${listening ? 'btn-danger' : 'btn-ghost'}`}
        onClick={toggleListening}
        disabled={disabled}
      >
        {listening ? `${'\u{1F534}'} Listening… tap to stop` : `${'\u{1F3A4}'} ${label}`}
      </button>
      {error && (
        <p className="tag tag-error" style={{ display: 'block', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
