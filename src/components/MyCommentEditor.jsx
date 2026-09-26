import { useState } from 'react';
import { saveMyComment } from '../lib/reviews';
import { COMMENT_MAX } from '../lib/ratingFlow';
import { friendlyError } from '../lib/friendlyError';

// Your own comment on a place you checked into: shows it, and lets you add
// one or edit it any time later. Used on the landmark page's Comments
// section and on each row of My Check-ins.
export default function MyCommentEditor({ userId, landmark, comment, onSaved, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // What you just saved shows right away, before the parent reloads.
  const [savedText, setSavedText] = useState(null);
  const shown = savedText ?? comment ?? '';

  const start = () => {
    setText(shown || '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMyComment({ userId, landmark, comment: text });
      setSavedText(saved);
      setEditing(false);
      onSaved?.(saved);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save your comment. It's still here -- try again."));
    } finally {
      setSaving(false);
    }
  };

  const stop = (e) => e.stopPropagation();

  if (!editing) {
    return (
      <div className={`my-comment ${compact ? 'my-comment-compact' : ''}`} onClick={stop} onKeyDown={stop}>
        {shown ? <p className="review-comment" style={{ margin: 0 }}>{shown}</p> : null}
        <button type="button" className="btn btn-ghost btn-tight" onClick={start}>
          {shown ? `${'\u{270F}\u{FE0F}'} Edit comment` : `${'\u{1F4AC}'} Add a comment`}
        </button>
      </div>
    );
  }

  return (
    <div className={`my-comment ${compact ? 'my-comment-compact' : ''}`} onClick={stop} onKeyDown={stop}>
      <textarea
        className="rating-comment"
        name="my-comment"
        aria-label={`Your comment on ${landmark.name}`}
        autoCapitalize="sentences"
        rows={3}
        maxLength={COMMENT_MAX}
        placeholder="What was it like? Anything worth knowing?"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="tag tag-error" style={{ display: 'block', marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
