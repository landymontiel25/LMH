import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { getUserProfile, sendFriendRequest, hasPendingRequestTo } from '../lib/friends';
import FriendStatsModal from './FriendStatsModal';

// Wraps a name (leaderboard, full-list page, wherever) so tapping it goes
// straight to that person's stats if you're already friends -- the same
// popup as tapping their name in the Friends list -- or, for someone you're
// not friends with yet, hovering (desktop) or tapping (mobile) pops open a
// small card with their @username and a one-tap way to friend them.
export default function FriendPopoverName({ userId, fallbackName, children }) {
  const { user } = useAuth();
  const { friendUids, myUsername } = useFriends();
  const [open, setOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | error message
  const ref = useRef(null);
  const closeTimer = useRef(null);

  const isMe = user && userId === user.uid;
  const isFriend = friendUids.has(userId);

  // Same hover-with-grace-period + tap-to-toggle pattern as the header's own
  // profile popover, so it behaves the same on a Mac trackpad and a phone.
  // Only relevant for the small "add friend" card below -- a friend's name
  // opens their stats modal directly instead, so it never needs a hover.
  const openNow = () => {
    if (isFriend) return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const handleActivate = () => {
    if (isFriend && !isMe) {
      setShowStats(true);
      return;
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (open && !profile && userId) {
      getUserProfile(userId).then((p) => setProfile(p || {})).catch(() => setProfile({}));
    }
  }, [open, userId, profile]);

  // The popover unmounts on close and re-mounts fresh on the next open, so
  // without this a request you already sent looks forgotten every time you
  // reopen it -- check for a pending request each time it opens and show
  // "Sent" immediately instead of "Add Friend" again.
  useEffect(() => {
    if (!open || !user || !userId || isMe) return;
    let cancelled = false;
    hasPendingRequestTo(user.uid, userId)
      .then((sent) => {
        if (!cancelled && sent) setStatus('sent');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, user, userId, isMe]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addFriend = async () => {
    if (!user || !profile?.uid) return;
    setStatus('sending');
    try {
      await sendFriendRequest(
        { uid: user.uid, username: myUsername, displayName: user.displayName, email: user.email },
        profile
      );
      setStatus('sent');
    } catch (e) {
      setStatus(e.message || 'Could not send request.');
    }
  };

  return (
    <span className="user-popover" ref={ref} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <span
        className="user-popover-trigger"
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleActivate();
          }
        }}
      >
        {children}
      </span>
      {open && !isFriend && (
        <div className="user-popover-card" onClick={(e) => e.stopPropagation()}>
          <div className="user-popover-username">@{profile?.username || fallbackName}</div>
          {!isMe && (
            <button
              type="button"
              className="btn btn-primary btn-tight"
              disabled={!profile || status === 'sending' || status === 'sent'}
              onClick={addFriend}
            >
              {status === 'sent' ? `${'\u{2713}'} Sent` : status === 'sending' ? '…' : `${'\u{2795}'} Add Friend`}
            </button>
          )}
          {status && status !== 'sending' && status !== 'sent' && <p className="user-popover-note">{status}</p>}
        </div>
      )}
      {showStats && (
        <FriendStatsModal uid={userId} name={profile?.username || fallbackName} onClose={() => setShowStats(false)} />
      )}
    </span>
  );
}
