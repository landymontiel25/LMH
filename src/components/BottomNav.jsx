import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';

// Outline icons (drawn in currentColor, so the active tab's color applies).
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  plan: (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Icon>
  ),
  landmarks: (
    <Icon>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </Icon>
  ),
  map: (
    <Icon>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Icon>
  ),
  itinerary: (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </Icon>
  ),
  profile: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Icon>
  ),
  test: (
    <Icon>
      <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" />
    </Icon>
  ),
};

// Same tabs and routes as always (Setup lives in Itinerary's "Create New
// Trip" modal); only the order, icons and the Mapr tab's "Plan" label follow
// the redesign.
const items = [
  { to: '/mapr', label: 'Plan', icon: ICONS.plan },
  { to: '/landmarks', label: 'Landmarks', icon: ICONS.landmarks },
  { to: '/', label: 'Map', icon: ICONS.map, end: true },
  { to: '/itinerary', label: 'Itinerary', icon: ICONS.itinerary },
  { to: '/profile', label: 'Profile', icon: ICONS.profile },
  // Throwaway tab for previewing a Mapr redesign concept -- see MaprTest.jsx.
  // Remove this row (and its route in App.jsx) once the design question is
  // settled either way.
  { to: '/mapr-test', label: 'Test', icon: ICONS.test },
];

export default function BottomNav() {
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
      // Only when actually zoomed in. At scale 1 iOS (especially the
      // home-screen app) can report the visible area a few dozen px
      // shorter than the window, which would nudge the bar up for no
      // reason and leave a gap under it.
      if (vv.scale <= 1.02) {
        el.style.transform = '';
        return;
      }
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

  return (
    <nav className="bottom-nav" ref={navRef}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
