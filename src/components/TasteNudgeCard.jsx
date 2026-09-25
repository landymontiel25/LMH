import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { saveTasteBaseline } from '../lib/friends';
import { TASTE_QUESTIONS } from '../lib/tasteQuestions';
import { Check as CheckIcon, Hand as HandIcon, MessageCircle as MessageCircleIcon, ThumbsDown as ThumbsDownIcon, ThumbsUp as ThumbsUpIcon, X as XIcon } from 'lucide-react';
import { CategoryIcon } from './icons';

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
  const [saveError, setSaveError] = useState(null);
  // The initial props are snapshotted into state once on mount (above). If
  // this opened before the profile's server read had landed, that snapshot
  // is empty even though real picks exist -- so as long as the traveler
  // hasn't touched anything yet, adopt the picks whenever they do arrive
  // instead of leaving them staring at a blank editor. Any edit flips this
  // and the seeded state is never overwritten from underneath them.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (dirtyRef.current) return;
    const init = {};
    for (const [catId, cat] of Object.entries(initialBaseline || {})) init[catId] = { ...cat };
    setPicked(init);
    setExtra(initialNotes || '');
    setCategoryNotes({ ...(initialCategoryNotes || {}) });
    setOpenComments(new Set(Object.keys(initialCategoryNotes || {}).filter((id) => initialCategoryNotes[id])));
  }, [initialBaseline, initialNotes, initialCategoryNotes]);

  const cycleChip = (categoryId, example) => {
    dirtyRef.current = true;
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
    dirtyRef.current = true;
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
    setSaveError(null);
    try {
      const cleanCategoryNotes = Object.fromEntries(
        Object.entries(categoryNotes).filter(([, v]) => v?.trim())
      );
      await saveTasteBaseline(user.uid, { baseline: picked, notes: extra, categoryNotes: cleanCategoryNotes });
      await reloadFriends();
      setSaving(false);
      // Hand the just-saved values back directly instead of making the
      // caller wait on reloadFriends()'s own state update to land -- see
      // TasteProfileCard's justSaved, which is exactly this bridging the
      // gap between "the write is done" and "the FriendsContext re-render
      // carrying it has actually happened" so the confidence score doesn't
      // flash the wrong thing (or stay wrong) right after Save.
      onDone({ baseline: picked, notes: extra, categoryNotes: cleanCategoryNotes });
      return;
    } catch (e) {
      // Used to swallow this and close anyway -- which silently threw away
      // whatever you'd just picked/typed the moment the write failed for
      // any reason (offline, a hiccup, whatever), with no sign anything
      // went wrong. Now it stays open with everything you entered intact
      // so you can just hit Save again, and actually says something failed
      // instead of looking like it worked.
      console.error('[TasteNudgeCard] saveTasteBaseline failed:', e);
      setSaving(false);
      setSaveError(e?.message || "Couldn't save — check your connection and try again.");
    }
  };

  return (
    <div className="card section taste-nudge-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
            <HandIcon aria-hidden="true" /> {editing ? 'Edit what you told Mapr' : "Tell Mapr what you like — and don't"}
          </h3>
          <p className="screen-subtitle" style={{ margin: '4px 0 0' }}>
            {editing
              ? 'Change any pick, add notes, then save — this replaces your saved baseline.'
              : "Or just say it in the chat — either way counts and you won't see this again. This becomes your baseline; rating actual landmarks fills in the specifics later."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={onDismiss} aria-label="Dismiss">
          <XIcon aria-hidden="true" />
        </button>
      </div>

      <ul
        className="screen-subtitle"
        style={{ margin: '10px 0 0', fontSize: '0.75rem', display: 'flex', gap: 12, flexWrap: 'wrap', padding: 0, listStyle: 'none' }}
      >
        <li>Tap 1x for <ThumbsUpIcon aria-hidden="true" /> like</li>
        <li>Tap 2x for <ThumbsDownIcon aria-hidden="true" /> dislike</li>
        <li>Tap 3x to clear</li>
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {TASTE_QUESTIONS.map((q) => {
          const commentOpen = openComments.has(q.id);
          const hasComment = !!categoryNotes[q.id]?.trim();
          return (
            <div key={q.id}>
              <p style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 600 }}>
                <CategoryIcon id={q.id} /> {q.label} — <span style={{ fontWeight: 400 }}>{q.prompt}</span>{' '}
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
                  <MessageCircleIcon aria-hidden="true" /> {hasComment ? <>Comment <CheckIcon aria-hidden="true" /></> : 'Comment'}
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
                      {state === 'like' ? <><ThumbsUpIcon aria-hidden="true" /> </> : state === 'dislike' ? <><ThumbsDownIcon aria-hidden="true" /> </> : ''}
                      {ex}
                    </button>
                  );
                })}
              </div>
              {commentOpen && (
                <textarea
                  className="rating-comment"
                  rows={2}
                  maxLength={2000}
                  placeholder={`Anything specific about ${q.label.toLowerCase()}? e.g. "no pepper on my steak"`}
                  value={categoryNotes[q.id] || ''}
                  onChange={(e) => {
                    dirtyRef.current = true;
                    setCategoryNotes((prev) => ({ ...prev, [q.id]: e.target.value }));
                  }}
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
        maxLength={2000}
        placeholder="Anything else, liked or hated? (optional)"
        value={extra}
        onChange={(e) => {
          dirtyRef.current = true;
          setExtra(e.target.value);
        }}
        disabled={saving}
        style={{ marginTop: 12 }}
      />

      {saveError && (
        <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
          {saveError}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 14 }}
        disabled={saving || (!editing && totalPicked === 0 && !extra.trim())}
        onClick={save}
      >
        {saving ? 'Saving…' : saveError ? 'Try Again' : totalPicked > 0 ? `Save (${totalPicked} picked)` : 'Save'}
      </button>
    </div>
  );
}
