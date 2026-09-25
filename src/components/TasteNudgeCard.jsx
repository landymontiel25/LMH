import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { saveTasteBaseline } from '../lib/friends';
import { TASTE_QUESTIONS } from '../lib/tasteQuestions';

// The "you haven't told Mapr what you like yet" nudge, expanded into
// something answerable in a few taps instead of a blank box: one quick
// example question per category ("Food: like or hate any of these?"),
// generated instantly from a fixed local list (no AI round trip to wait
// on). Every chip is tri-state (tap: neutral -> like -> dislike -> neutral)
// -- this is meant to become the BASELINE Mapr starts every suggestion
// from, likes AND dislikes both; individual landmark ratings then refine it
// further with specific reasons ("no pepper on my steak") as they come in,
// same as always. Each category also has its own optional Comment field
// (e.g. "no pepper on my steak") -- feeds Mapr's analysis alongside the
// picks (see baselineToSyntheticReviews' comment field), not just a
// separate note nobody reads.
//
// Also doubles as the edit flow: TasteProfileCard's Edit button reopens
// this same card pre-filled from the saved baseline (initialBaseline/
// initialNotes/initialCategoryNotes), so resubmitting after a change
// replaces the old answers rather than piling a new sentence on top of
// them (see saveTasteBaseline).
export default function TasteNudgeCard({
  onDone,
  onDismiss,
  initialBaseline,
  initialNotes,
  initialCategoryNotes,
  editing = false,
}) {
  const { user } = useAuth();
  const { reload: reloadFriends } = useFriends();
  // Deep-copy the initial baseline into per-category Sets-as-objects so
  // editing here never mutates the profile's own object by reference.
  const [picked, setPicked] = useState(() => {
    const init = {};
    for (const [catId, cat] of Object.entries(initialBaseline || {})) init[catId] = { ...cat };
    return init;
  });
  const [extra, setExtra] = useState(initialNotes || '');
  const [categoryNotes, setCategoryNotes] = useState(() => ({ ...(initialCategoryNotes || {}) }));
  const [openComments, setOpenComments] = useState(
    () => new Set(Object.keys(initialCategoryNotes || {}).filter((id) => initialCategoryNotes[id]))
  );
  const [saving, setSaving] = useState(false);

  const cycleChip = (categoryId, example) => {
    setPicked((prev) => {
      const cat = { ...(prev[categoryId] || {}) };
      const cur = cat[example];
      const next = cur === undefined ? 'like' : cur === 'like' ? 'dislike' : undefined;
      if (next === undefined) delete cat[example];
      else cat[example] = next;
      return { ...prev, [categoryId]: cat };
    });
  };

  const toggleComment = (categoryId) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const totalPicked = Object.values(picked).reduce((n, cat) => n + Object.keys(cat).length, 0);

  const save = async () => {
    setSaving(true);
    try {
      const cleanCategoryNotes = Object.fromEntries(
        Object.entries(categoryNotes).filter(([, v]) => v?.trim())
      );
      await saveTasteBaseline(user.uid, { baseline: picked, notes: extra, categoryNotes: cleanCategoryNotes });
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
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
            {'\u{1F44B}'} {editing ? 'Edit what you told Mapr' : "Tell Mapr what you like — and don't"}
          </h3>
          <p className="screen-subtitle" style={{ margin: '4px 0 0' }}>
            {editing
              ? 'Change any pick, add notes, then save — this replaces your saved baseline.'
              : "Or just say it in the chat — either way counts and you won't see this again. This becomes your baseline; rating actual landmarks fills in the specifics later."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={onDismiss} aria-label="Dismiss">
          {'\u{2715}'}
        </button>
      </div>

      <ul
        className="screen-subtitle"
        style={{ margin: '10px 0 0', fontSize: '0.75rem', display: 'flex', gap: 12, flexWrap: 'wrap', padding: 0, listStyle: 'none' }}
      >
        <li>Tap 1x for {'\u{1F44D}'} like</li>
        <li>Tap 2x for {'\u{1F44E}'} dislike</li>
        <li>Tap 3x to clear</li>
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {TASTE_QUESTIONS.map((q) => {
          const commentOpen = openComments.has(q.id);
          const hasComment = !!categoryNotes[q.id]?.trim();
          return (
            <div key={q.id}>
              <p style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 600 }}>
                {q.icon} {q.label} — <span style={{ fontWeight: 400 }}>{q.prompt}</span>{' '}
                <button
                  type="button"
                  onClick={() => toggleComment(q.id)}
                  disabled={saving}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    color: hasComment ? 'var(--color-brass-bright, inherit)' : 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {'\u{1F4AC}'} {hasComment ? 'Comment ✓' : 'Comment'}
                </button>
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {q.examples.map((ex) => {
                  const state = picked[q.id]?.[ex];
                  return (
                    <button
                      key={ex}
                      type="button"
                      className={`tag ${state === 'like' ? 'tag-active' : ''} ${state === 'dislike' ? 'tag-dislike' : ''}`}
                      style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
                      onClick={() => cycleChip(q.id, ex)}
                      disabled={saving}
                    >
                      {state === 'like' ? `${'\u{1F44D}'} ` : state === 'dislike' ? `${'\u{1F44E}'} ` : ''}
                      {ex}
                    </button>
                  );
                })}
              </div>
              {commentOpen && (
                <textarea
                  className="rating-comment"
                  rows={2}
                  maxLength={200}
                  placeholder={`Anything specific about ${q.label.toLowerCase()}? e.g. "no pepper on my steak"`}
                  value={categoryNotes[q.id] || ''}
                  onChange={(e) => setCategoryNotes((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  disabled={saving}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <textarea
        className="rating-comment"
        rows={2}
        maxLength={300}
        placeholder="Anything else, liked or hated? (optional)"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        disabled={saving}
        style={{ marginTop: 12 }}
      />

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 14 }}
        disabled={saving || (!editing && totalPicked === 0 && !extra.trim())}
        onClick={save}
      >
        {saving ? 'Saving…' : totalPicked > 0 ? `Save (${totalPicked} picked)` : 'Save'}
      </button>
    </div>
  );
}
