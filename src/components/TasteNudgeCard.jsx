import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { saveTasteIntro } from '../lib/friends';
import { TASTE_QUESTIONS } from '../lib/tasteQuestions';
import VoiceInputButton from './VoiceInputButton';

// The "you haven't told Mapr what you like yet" nudge, expanded into
// something answerable in a few taps instead of a blank box: one quick
// example question per category ("For food, do you like steak or pizza?"),
// multi-select chips, generated instantly from a fixed local list (no AI
// round trip to wait on). Picking chips builds the same free-text tasteIntro
// typing or speaking would -- Mapr reads it as prose either way. Typing or
// speaking directly into the chat below still works too and satisfies this
// exactly the same (see Mapr.jsx's send()).
export default function TasteNudgeCard({ onDone, onDismiss }) {
  const { user } = useAuth();
  const { myProfile, reload: reloadFriends } = useFriends();
  const [picked, setPicked] = useState({}); // { [categoryId]: Set<string> }
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleChip = (categoryId, example) => {
    setPicked((prev) => {
      const next = new Set(prev[categoryId] || []);
      if (next.has(example)) next.delete(example);
      else next.add(example);
      return { ...prev, [categoryId]: next };
    });
  };

  const totalPicked = Object.values(picked).reduce((n, set) => n + set.size, 0);

  const save = async () => {
    setSaving(true);
    try {
      const byCategory = TASTE_QUESTIONS.filter((q) => picked[q.id]?.size).map(
        (q) => `${q.label}: ${[...picked[q.id]].join(', ')}`
      );
      const sentence = [...byCategory, extra.trim()].filter(Boolean).join('. ');
      const combined = [myProfile?.tasteIntro, sentence].filter(Boolean).join('. ');
      await saveTasteIntro(user.uid, combined);
      await reloadFriends();
    } catch {
      // Best-effort -- never block dismissing the nudge on this write failing.
    }
    setSaving(false);
    onDone();
  };

  return (
    <div className="card section taste-nudge-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{'\u{1F44B}'} Tell Mapr what you like</h3>
          <p className="screen-subtitle" style={{ margin: '4px 0 0' }}>
            Tap a few examples below, or just say it in the chat — either way counts and you won't see this again.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={onDismiss} aria-label="Dismiss">
          {'\u{2715}'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {TASTE_QUESTIONS.map((q) => (
          <div key={q.id}>
            <p style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 600 }}>
              {q.icon} {q.label} — <span style={{ fontWeight: 400 }}>{q.prompt}</span>
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {q.examples.map((ex) => {
                const active = picked[q.id]?.has(ex);
                return (
                  <button
                    key={ex}
                    type="button"
                    className={`tag ${active ? 'tag-active' : ''}`}
                    style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
                    onClick={() => toggleChip(q.id, ex)}
                    disabled={saving}
                  >
                    {active ? `${'\u{2713}'} ` : ''}
                    {ex}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <textarea
        className="rating-comment"
        rows={2}
        maxLength={300}
        placeholder="Anything else? (optional)"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        disabled={saving}
        style={{ marginTop: 12 }}
      />
      <div style={{ marginTop: 8 }}>
        <VoiceInputButton onText={(spoken) => setExtra((prev) => (prev ? `${prev} ${spoken}` : spoken))} disabled={saving} />
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 14 }}
        disabled={saving || (totalPicked === 0 && !extra.trim())}
        onClick={save}
      >
        {saving ? 'Saving…' : totalPicked > 0 ? `Save (${totalPicked} picked)` : 'Save'}
      </button>
    </div>
  );
}
