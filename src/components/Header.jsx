import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useBadges } from '../lib/BadgesContext';
import { useAdminMode } from '../lib/AdminModeContext';
import { subscribeLeaderboard } from '../lib/leaderboard';
import { subscribeMyNotifications } from '../lib/notifications';
import { Skeleton } from './Skeleton';

// Dead center of the header, on every screen -- the one stat people check
// without thinking about it, so it doesn't live behind a tap like the rest
// of ProfileMenu's popover. Flame animates (flicker, not spin/bounce) only
// while there's an actual streak to celebrate; a cold start shows a dim,
// still flame instead of implying progress that isn't there. Turns
// warning-colored once today's check-in hasn't secured it yet -- same
// signal StreakWarningBanner gives, just always in view instead of only
// right before local midnight.
function StreakBadge() {
  const { user, firebaseEnabled } = useAuth();
  const { streakDays, checkedInToday } = useBadges();

  if (!firebaseEnabled || !user) return null;

  const active = streakDays > 0;
  const atRisk = active && !checkedInToday;
  const title = !active
    ? 'Check in today to start a streak'
    : atRisk
    ? `${streakDays}-day streak — check in today to keep it`
    : `${streakDays}-day streak — today's secured`;

  return (
    <Link to="/profile" className={`header-streak ${active ? 'active' : ''} ${atRisk ? 'at-risk' : ''}`} title={title}>
      <span className="header-streak-flame" aria-hidden="true">
        {'\u{1F525}'}
      </span>
      <span className="header-streak-num">{streakDays}</span>
    </Link>
  );
}

// Header identity control. Shows who you're signed in as; hovering (desktop)
// or tapping (mobile) reveals this week's rank/points, a "Notifications"
// link (badged with the unread count), and "View Profile". Notifications
// live inside this dropdown rather than as their own header icon -- a
// second always-visible icon here has no room next to the wordmark on a
// narrow phone.
function ProfileMenu() {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername, requests } = useFriends();
  const { adminMode, canUseAdminMode, setAdminMode } = useAdminMode();
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
    }, 50, () => setMe({ points: null, rank: null, failed: true }));
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

  return (
    <div className="profile-menu" ref={ref} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button type="button" className="score-chip profile-menu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="score-chip-pts">{name}</span>
        <span className="profile-menu-caret">{'▾'}</span>
      </button>
      {open && (
        <div className="points-popover">
          <div className="points-popover-joined">This Week</div>
          {/* Before the weekly board's first snapshot, "— · 0 pts" would read
              as a real (and discouraging) answer -- show a placeholder instead. */}
          {me ? (
            <div>
              {'\u{1F3C6}'} {me.failed ? "Couldn't load this week's rank" : <>{me.rank ? `#${me.rank}` : '—'} {'·'} {me.points.toLocaleString()} pts</>}
            </div>
          ) : (
            <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="visually-hidden">Loading this week's rank…</span>
              {'\u{1F3C6}'} <Skeleton className="skeleton-inline" width={90} height={13} />
            </div>
          )}
          {/* Admin account only -- same switch as Settings -> Admin Mode. */}
          {canUseAdminMode && (
            <label className="admin-mode-switch">
              <span>{'\u{1F6E0}\u{FE0F}'} Admin Mode</span>
              <input
                type="checkbox"
                role="switch"
                checked={adminMode}
                onChange={(e) => setAdminMode(e.target.checked)}
              />
              <span className="admin-mode-switch-track" aria-hidden="true" />
            </label>
          )}
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
  return (
    <header className="app-header">
      {/* Logo only -- the wordmark next to it used to crowd this pill on
          narrow phones, and the mark alone is identifiable enough. */}
      <Link to="/" aria-label="Landmark Hunters" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <img src="/logo.png" alt="Landmark Hunters" className="brand-mark" />
      </Link>
      {/* Sits in the flex gap between the logo and the profile pill, so a
          long @username can only shrink this space, never sit under it. */}
      <div className="app-header-center">
        <StreakBadge />
      </div>
      <div className="app-header-actions">
        <ProfileMenu />
      </div>
    </header>
  );
}
