import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { answerTagCapPrompt } from '../lib/friends';
import { pendingCapPrompt } from '../lib/tagScores';
import { categoryLabel } from '../lib/ratingFlow';
import { useToast, runOptimistic } from '../lib/ToastContext';

// Shows once per tag, the first time a rating pushes that tag's score to
// the cap in any region (see tagScores.js). "Yes" adds a 1.5x ranking boost
// for that tag everywhere; the comment goes to Mapr Picks as TAG NOTES.
// Answering either way stores capAnswers[tag], which stops it asking again.
export default function TagCapPrompt() {
  const { user } = useAuth();
  const { myProfile, profileFresh } = useFriends();
  const toast = useToast();
  const [note, setNote] = useState('');
  // Hides the card the moment you answer, before the profile listener
  // delivers the saved answer back.
  const [answered, setAnswered] = useState(() => new Set());

  if (!user || !profileFresh) return null;
  const pending = pendingCapPrompt(myProfile);
  if (!pending || answered.has(pending.tag)) return null;

  // Optimistic: the card closes on tap. If the save fails it comes back
  // with your note still typed, plus a Retry toast.
  const answer = (choice, tag = pending.tag, text = note) =>
    runOptimistic({
      apply: () => {
        setAnswered((cur) => new Set(cur).add(tag));
        setNote('');
      },
      commit: () => answerTagCapPrompt(user.uid, tag, choice, text),
      rollback: () => {
        setAnswered((cur) => {
          const next = new Set(cur);
          next.delete(tag);
          return next;
        });
        setNote((cur) => cur || text);
      },
      toast,
      errorMessage: "Couldn't save your answer.",
      retry: () => answer(choice, tag, text),
    });

  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="tag-cap-title">
        <h3 id="tag-cap-title" style={{ marginTop: 0 }}>
          {'\u{1F525}'} You really love {categoryLabel(pending.tag)}.
        </h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          Want us to lean more into it, even if it means slightly fewer other picks?
        </p>

        <textarea
          name="tag-note"
          aria-label="Anything else you want us to know?"
          autoComplete="off"
          className="rating-comment"
          rows={3}
          maxLength={500}
          placeholder="Anything else you want us to know?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={() => answer('yes')}>
            Yes
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => answer('no')}>
            No
          </button>
        </div>
      </div>
    </div>
  );
}
