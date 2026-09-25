import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { answerTagCapPrompt } from '../lib/friends';
import { pendingCapPrompt } from '../lib/tagScores';
import { categoryLabel } from '../lib/ratingFlow';
import { getRegion } from '../data/regions';

// Shows once per region/tag, the first time a rating pushes that tag's
// score to the cap (see tagScores.js). "Yes" adds a 1.5x ranking boost for
// that tag; the comment goes to Mapr Picks as TAG NOTES. Answering either
// way stores tagBoosts[region][tag], which is what stops it asking again.
export default function TagCapPrompt() {
  const { user } = useAuth();
  const { myProfile, profileFresh } = useFriends();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Hides the card the moment you answer, before the profile listener
  // delivers the saved answer back.
  const [answered, setAnswered] = useState(() => new Set());

  if (!user || !profileFresh) return null;
  const pending = pendingCapPrompt(myProfile);
  if (!pending || answered.has(`${pending.region}/${pending.tag}`)) return null;

  const tagName = categoryLabel(pending.tag);
  const regionName = getRegion(pending.region)?.name;

  const answer = async (choice) => {
    setSaving(true);
    try {
      await answerTagCapPrompt(user.uid, pending.region, pending.tag, choice, note);
    } catch {
      // Best-effort: if the write fails, the prompt comes back next session.
    }
    setAnswered((cur) => new Set(cur).add(`${pending.region}/${pending.tag}`));
    setNote('');
    setSaving(false);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="tag-cap-title">
        <h3 id="tag-cap-title" style={{ marginTop: 0 }}>
          {'\u{1F525}'} You really love {tagName}.
        </h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          Want us to lean more into it{regionName ? ` in ${regionName}` : ''}, even if it means slightly fewer other
          picks?
        </p>

        <textarea
          className="rating-comment"
          rows={3}
          maxLength={500}
          placeholder="Anything else you want us to know?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={() => answer('yes')}>
            Yes
          </button>
          <button type="button" className="btn btn-ghost btn-block" disabled={saving} onClick={() => answer('no')}>
            No
          </button>
        </div>
      </div>
    </div>
  );
}
