import { useState } from 'react';
import { getReplies, addReply, deleteReply } from '../lib/reviews';

// One reply level under a review -- lazily loaded (only fetched once
// expanded) since most reviews on a landmark page will never be opened.
export default function ReviewReplies({ reviewId, currentUser, reviewAuthorUid }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setReplies(await getReplies(reviewId));
    } catch {
      setReplies([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && replies === null) load();
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || !currentUser) return;
    setBusy(true);
    try {
      await addReply(reviewId, { uid: currentUser.uid, userName: currentUser.displayName || currentUser.email, text });
      setDraft('');
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (replyId) => {
    setReplies((cur) => cur.filter((r) => r.id !== replyId));
    try {
      await deleteReply(reviewId, replyId);
    } catch {
      load();
    }
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className="btn btn-ghost btn-tight" onClick={toggle}>
        {open ? 'Hide replies' : `Replies${replies?.length ? ` (${replies.length})` : ''}`}
      </button>
      {open && (
        <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: '2px solid rgba(255,255,255,0.12)' }}>
          {loading && (
            <p className="screen-subtitle" style={{ margin: 0 }}>
              Loading…
            </p>
          )}
          {replies?.map((r) => (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                <strong>{r.userName}</strong> {r.text}
              </p>
              {currentUser && (r.uid === currentUser.uid || reviewAuthorUid === currentUser.uid) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  style={{ fontSize: '0.7rem' }}
                  onClick={() => handleDelete(r.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
          {replies?.length === 0 && !loading && (
            <p className="screen-subtitle" style={{ margin: 0 }}>
              No replies yet.
            </p>
          )}
          {currentUser && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reply…"
                maxLength={500}
                style={{ flex: 1 }}
                className="friend-email-input"
              />
              <button className="btn btn-primary btn-tight" disabled={busy || !draft.trim()} onClick={handleAdd}>
                Post
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
