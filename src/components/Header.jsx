import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { subscribeLeaderboard } from '../lib/leaderboard';
import { subscribeMyNotifications } from '../lib/notifications';

// Header identity control. Shows who you're signed in as; hovering (desktop)
// or tapping (mobile) reveals this week's rank/points, a "Notifications"
// link (badged with the unread count), and "View Profile". Notifications
// live inside this dropdown rather than as their own header icon -- a
// second always-visible icon here has no room next to the wordmark on a
// narrow phone.
export function ProfileMenu() {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername, requests } = useFriends();
  const navigate = useNavigate();
  const [me, setMe] = useState(null); // { points, rank } for the current week
  const [unread, setUnread] = useState(0);
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
    if (!firebaseEnabled || !user) {
      setUnread(0);
      return;
    }
    return subscribeMyNotifications(user.uid, (items) => setUnread(items.filter((n) => !n.read).length));
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
  const notificationCount = unread + requests.length;
  // Initials for the avatar: "Landy Montiel" -> LM, else the username's first two letters.
  const words = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
  const initials = (
    words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (myUsername || words[0] || 'Explorer').slice(0, 2)
  ).toUpperCase();

  return (
    <div className="profile-menu" ref={ref} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        className="profile-avatar profile-menu-trigger"
        title={name}
        aria-label={`${name} menu`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>
      {open && (
        <div className="points-popover">
          <div className="points-popover-name">{name}</div>
          <div className="points-popover-joined">This Week</div>
          <div>
            {'\u{1F3C6}'} {me?.rank ? `#${me.rank}` : '—'} {'·'} {me ? me.points.toLocaleString() : 0} pts
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ position: 'relative', flex: 1 }}
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
            >
              {'\u{1F514}'} Notifications
              {notificationCount > 0 && (
                <span
                  aria-label={`${notificationCount} notifications`}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 8,
                    background: 'var(--color-error, #b3503f)',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    lineHeight: 1,
                  }}
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <Link to="/profile" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setOpen(false)}>
              View Profile
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  // The Plan (Mapr) screen draws its own top row (wordmark, city, avatar).
  const { pathname } = useLocation();
  if (pathname === '/mapr') return null;
  return (
    <header className="app-header">
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}>
        <img src="/logo.svg" alt="Landmark Hunters" />
        <span className="brand-text">Landmark Hunters</span>
      </Link>
      <div className="app-header-actions">
        <ProfileMenu />
      </div>
    </header>
  );
}
