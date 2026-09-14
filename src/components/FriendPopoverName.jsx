import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { getUserProfile, sendFriendRequest, hasPendingRequestTo } from '../lib/friends';

// Wraps a name (leaderboard, full-list page, wherever) so hovering it
// (desktop) or tapping it (mobile) pops open a small card with that
// person's @username and a one-tap way to friend them -- fetched on demand
// since the caller usually only has a display name, not their real
// username, friend status, or whether a request is already pending.
export default function FriendPopoverName({ userId, fallbackName, children }) {
  const { user } = useAuth();
  const { friendUids, myUsername } = useFriends();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | error message
  const ref = useRef(null);
  const closeTimer = useRef(null);

  const isMe = user && userId === user.uid;
  const isFriend = friendUids.has(userId);

  // Same hover-with-grace-period + tap-to-toggle pattern as the header's own
  // profile popover, so it behaves the same on a Mac trackpad and a phone.
  const openNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

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
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </span>
      {open && (
        <div className="user-popover-card" onClick={(e) => e.stopPropagation()}>
          <div className="user-popover-username">@{profile?.username || fallbackName}</div>
          {!isMe &&
            (isFriend ? (
              <span className="user-popover-note">{'\u{2713}'} Friends</span>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-tight"
                disabled={!profile || status === 'sending' || status === 'sent'}
                onClick={addFriend}
              >
                {status === 'sent' ? `${'\u{2713}'} Sent` : status === 'sending' ? '…' : `${'\u{2795}'} Add Friend`}
              </button>
            ))}
          {status && status !== 'sending' && status !== 'sent' && <p className="user-popover-note">{status}</p>}
        </div>
      )}
    </span>
  );
}
