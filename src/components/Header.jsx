import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { subscribeLeaderboard } from '../lib/leaderboard';
import NotificationBell from './NotificationBell';

// Header identity control. Shows who you're signed in as; hovering (desktop)
// or tapping (mobile) reveals this week's rank/points plus one explicit
// "View Profile" link. The bottom nav's Profile tab already goes to the same
// place in an obvious, labeled way -- so this doesn't need to double as a
// second hidden nav button, just a glanceable stat with one clear way out.
function ProfileMenu() {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const [me, setMe] = useState(null); // { points, rank } for the current week
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const closeTimer = useRef(null);

  // The popover sits a few pixels below the trigger (see .points-popover's
  // top offset) -- moving the mouse straight down crosses that gap outside
  // both elements' hover area. A short grace period survives the crossing;
  // re-entering (the popover is a descendant, so this fires again) cancels it.
  const openNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setMe(null);
      return;
    }
    const unsub = subscribeLeaderboard('weekly', (entries) => {
      const idx = entries.findIndex((e) => e.userId === user.uid);
      setMe({ points: idx >= 0 ? entries[idx].points : 0, rank: idx >= 0 ? idx + 1 : null });
    });
    return unsub;
  }, [firebaseEnabled, user]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!firebaseEnabled) return null;

  // Signed out: a gentle nudge to join the competition, straight to /profile.
  if (!user) {
    return (
      <Link to="/profile" className="score-chip score-chip-join" title="Sign in to compete">
        {'\u{1F3C6}'} Compete
      </Link>
    );
  }

  const name = myUsername ? `@${myUsername}` : user.displayName || 'Explorer';

  return (
    <div className="profile-menu" ref={ref} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button type="button" className="score-chip profile-menu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="score-chip-pts">{name}</span>
        <span className="profile-menu-caret">{'▾'}</span>
      </button>
      {open && (
        <div className="points-popover">
          <div className="points-popover-joined">This Week</div>
          <div>
            {'\u{1F3C6}'} {me?.rank ? `#${me.rank}` : '—'} {'·'} {me ? me.points.toLocaleString() : 0} pts
          </div>
          <Link to="/profile" className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>
            View Profile
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  return (
    <header className="app-header">
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}>
        <img src="/logo.svg" alt="Landmark Hunters" />
        <span className="brand-text">Landmark Hunters</span>
      </Link>
      <div className="app-header-actions">
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
