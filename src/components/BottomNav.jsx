import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Map', icon: '\u{1F310}', end: true },
  { to: '/setup', label: 'Setup', icon: '\u{1F9ED}' },
  { to: '/landmarks', label: 'Landmarks', icon: '\u{1F4CD}' },
  { to: '/itinerary', label: 'Itinerary', icon: '\u{1F5FA}\u{FE0F}' },
  { to: '/profile', label: 'Profile', icon: '\u{1F3C6}' },
  { to: '/mapr', label: 'Mapr', icon: '\u{1F9E0}' },
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
