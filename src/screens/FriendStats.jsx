import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUserStats, getUserCheckins } from '../lib/leaderboard';
import { getUserProfile } from '../lib/friends';
import { getRegion } from '../data/regions';

// A friend's stats summary as a real page, not a modal -- a modal-backdrop/
// modal-card stacked over the Profile screen rendered oddly on iOS Safari.
// Just the top-level numbers here (points/check-ins/cities + last check-in);
// tapping Check-ins or Cities goes to its own separate page in turn
// (/friend/:uid/checkins, /friend/:uid/cities) rather than another overlay.
export default function FriendStats() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, s, checkins] = await Promise.all([
          getUserProfile(uid),
          getUserStats(uid),
          getUserCheckins(uid),
        ]);
        if (cancelled) return;
        setName(profile?.username || 'this user');
        setStats(s);
        setRecent(checkins[0] || null);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 24 }} onClick={() => navigate(-1)}>
        {'←'} Back
      </button>
      <h1 className="screen-title">
        <span>{'\u{1F464}'}</span> @{name || '…'}
      </h1>

      {error && <p className="screen-subtitle">Could not load their stats — try again.</p>}
      {!error && !stats && <p className="screen-subtitle">Loading…</p>}

      {stats && (
        <div className="card section">
          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-num">{stats.totalPoints.toLocaleString()}</span>
              <span className="profile-stat-label">total pts</span>
            </div>
            <button
              type="button"
              className="profile-stat profile-stat-btn"
              onClick={() => stats.checkins && navigate(`/friend/${uid}/checkins`)}
            >
              <span className="profile-stat-num">{stats.checkins.toLocaleString()}</span>
              <span className="profile-stat-label">check-ins{stats.checkins ? ' ›' : ''}</span>
            </button>
            <button
              type="button"
              className="profile-stat profile-stat-btn"
              onClick={() => stats.cities && navigate(`/friend/${uid}/cities`)}
            >
              <span className="profile-stat-num">{stats.cities}</span>
              <span className="profile-stat-label">cities{stats.cities ? ' ›' : ''}</span>
            </button>
          </div>
          {recent ? (
            <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
              Last check-in: <strong>{recent.landmarkName || 'a landmark'}</strong>
              {recent.region ? ` — ${getRegion(recent.region)?.name || ''}` : ''}
            </p>
          ) : (
            <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
              No check-ins yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
