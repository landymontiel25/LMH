import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { saveTasteIntro } from '../lib/friends';
import VoiceInputButton from '../components/VoiceInputButton';

// Optional onboarding step: "tell Mapr what you already love," in your own
// words -- "I love racing, steak, pickleball, the boat... I like fancy,
// luxurious things." Fed to the AI verbatim (see api/plan-ai.js and
// api/mapr-picks.js's TASTE INTRO section) rather than parsed into
// categories, so it can shape suggestions from day one instead of waiting
// for a first rating. Entirely optional -- Skip moves on with nothing saved,
// and the same text can be added or edited anytime later from Settings.
export default function TasteIntroStep({ onDone }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

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
        your first rating. Talking is faster than typing -- tap the mic below.
      </p>
      <p className="screen-subtitle" style={{ marginTop: -10, fontSize: '0.78rem' }}>
        For example: "I love racing, steak, pickleball, the boat... I like fancy, luxurious things. I also love
        hiking and views, but on a Saturday night in the city I want a club, not a trail." Mentioning when or in
        what mood you want something (not just that you like it) helps Mapr get the timing right too.
      </p>

      <textarea
        className="rating-comment"
        rows={5}
        maxLength={600}
        placeholder="What are you already into?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={saving}
      />

      <div style={{ marginTop: 10 }}>
        <VoiceInputButton onText={(spoken) => setText((prev) => (prev ? `${prev} ${spoken}` : spoken))} disabled={saving} />
      </div>

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
