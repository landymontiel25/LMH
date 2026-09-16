import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { isAdmin } from '../lib/admins';
import { subscribePendingCount } from '../lib/customLandmarks';

const items = [
  { to: '/', label: 'Map', icon: '\u{1F310}', end: true },
  { to: '/setup', label: 'Setup', icon: '\u{1F9ED}' },
  { to: '/landmarks', label: 'Landmarks', icon: '\u{1F4CD}' },
  { to: '/itinerary', label: 'Itinerary', icon: '\u{1F5FA}\u{FE0F}' },
  { to: '/profile', label: 'Profile', icon: '\u{1F3C6}' },
  { to: '/test', label: 'Test', icon: '\u{1F9EA}' },
];

export default function BottomNav() {
  const { user, firebaseEnabled } = useAuth();
  const admin = firebaseEnabled && isAdmin(user?.email);
  const [pendingCount, setPendingCount] = useState(0);
  const navRef = useRef(null);

  // If the page is zoomed anyway (pinch), position: fixed sticks to the
  // unzoomed layout viewport on iOS and the bar lands mid-screen. The
  // visual viewport API says where the visible area actually is; shift
  // the bar by the difference so it stays on the visible bottom edge.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = navRef.current;
    if (!vv || !el) return;
    const update = () => {
      const shift = Math.round(vv.offsetTop + vv.height - window.innerHeight);
      el.style.transform = shift ? `translateY(${shift}px) translateZ(0)` : '';
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Live count, not a one-time fetch -- a new submission (or one someone
  // else just approved) updates the badge without needing to open Profile.
  useEffect(() => {
    if (!admin) {
      setPendingCount(0);
      return;
    }
    return subscribePendingCount(setPendingCount);
  }, [admin]);

  return (
    <nav className="bottom-nav" ref={navRef}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon" style={{ position: 'relative' }}>
            {item.icon}
            {item.to === '/profile' && admin && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending submissions`}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -8,
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
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
