import { Link } from 'react-router-dom';

// Any link that doesn't match a real screen (an old bookmark, a typo'd
// share link) lands here instead of a blank page.
export default function NotFound() {
  return (
    <div className="empty-state">
      <p style={{ fontSize: '2.4rem', margin: '0 0 8px' }}>{'\u{1F9ED}'}</p>
      <h1 className="screen-title">This page wandered off</h1>
      <p className="screen-subtitle">The link might be old or mistyped. Everything else is right where you left it.</p>
      <Link to="/" className="btn btn-primary">
        {'\u{1F310}'} Back to the Map
      </Link>
    </div>
  );
}
