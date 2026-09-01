import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from '../lib/useTheme';
import { useAuth } from '../lib/AuthContext';
import { subscribeLeaderboard } from '../lib/leaderboard';

// Always-visible score/rank chip so the competition is felt on every screen.
// Live from this week's leaderboard; tap it to open the full standings.
function ScoreChip() {
  const { user, firebaseEnabled } = useAuth();
  const [me, setMe] = useState(null); // { points, rank } for the current week

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

  if (!firebaseEnabled) return null;

  // Signed out: a gentle nudge to join the competition.
  if (!user) {
    return (
      <Link to="/profile" className="score-chip score-chip-join" title="Sign in to compete">
        {'\u{1F3C6}'} Compete
      </Link>
    );
  }

  return (
    <Link to="/profile" className="score-chip" title="See the leaderboard">
      <span className="score-chip-rank">{'\u{1F3C6}'} {me?.rank ? `#${me.rank}` : '—'}</span>
      <span className="score-chip-pts">{me ? me.points.toLocaleString() : 0}</span>
    </Link>
  );
}

export default function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="app-header">
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}>
        <img src="/logo.svg" alt="Landmark Hunters" />
        <span className="brand-text">Landmark Hunters</span>
      </Link>
      <div className="app-header-actions">
        <ScoreChip />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
