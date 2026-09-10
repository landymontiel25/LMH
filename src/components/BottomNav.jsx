import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Map', icon: '\u{1F310}', end: true },
  { to: '/setup', label: 'Setup', icon: '\u{1F9ED}' },
  { to: '/landmarks', label: 'Landmarks', icon: '\u{1F4CD}' },
  { to: '/itinerary', label: 'Itinerary', icon: '\u{1F5FA}\u{FE0F}' },
  { to: '/profile', label: 'Ranks', icon: '\u{1F3C6}' },
  { to: '/test', label: 'Test', icon: '\u{1F9EA}' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
