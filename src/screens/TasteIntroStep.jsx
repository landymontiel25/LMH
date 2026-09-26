import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { saveTasteIntro } from '../lib/friends';
import { friendlyError } from '../lib/friendlyError';
import { usePersistentState } from '../lib/usePersistentState';
import ErrorNotice from '../components/ErrorNotice';

// Optional onboarding step: "tell Mapr what you already love," in your own
// words -- "I love racing, steak, pickleball, the boat... I like fancy,
// luxurious things." Fed to the AI verbatim (see api/plan-ai.js and
// api/mapr-picks.js's TASTE INTRO section) rather than parsed into
// categories, so it can shape suggestions from day one instead of waiting
// for a first rating. Entirely optional -- Skip moves on with nothing saved,
// and the same text can be added or edited anytime later from Settings.
export default function TasteIntroStep({ onDone }) {
  const { user } = useAuth();
  // Same draft key as Settings' "Tell Mapr What You Love" box, so text typed
  // here (and not saved -- skipped, or the save failed) is waiting there.
  const [text, setText, clearDraft] = usePersistentState(user ? `tasteIntro.${user.uid}` : null, '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const saveAndContinue = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveTasteIntro(user.uid, text);
    } catch (err) {
      // Stay here with the text intact and say so -- Skip still moves on
      // (onboarding never blocks on this), and the draft survives for Settings.
      setSaving(false);
      setSaveError(err);
      return;
    }
    clearDraft();
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
        your first rating.
      </p>
      <p className="screen-subtitle" style={{ marginTop: -10, fontSize: '0.78rem' }}>
        For example: "I love racing, steak, pickleball, the boat... I like fancy, luxurious things. I also love
        hiking and views, but on a Saturday night in the city I want a club, not a trail." Mentioning when or in
        what mood you want something (not just that you like it) helps Mapr get the timing right too.
      </p>

      <textarea
        className="rating-comment"
        name="taste-intro"
        autoComplete="off"
        autoCapitalize="sentences"
        aria-label="What you love"
        rows={5}
        maxLength={2000}
        placeholder="What are you already into?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={saving}
      />

      {saveError && (
        <ErrorNotice
          compact
          message={friendlyError(saveError, "Couldn't save that. Your text is still here — try again, or skip for now.")}
          onRetry={saveAndContinue}
        />
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
