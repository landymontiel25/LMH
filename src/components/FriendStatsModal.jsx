import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserStats, getUserCheckins } from '../lib/leaderboard';
import { getRegion } from '../data/regions';

// A friend's quick summary -- points/check-ins/cities/last check-in -- as a
// popup modal. Check-ins and Cities are buttons that navigate to their own
// real pages rather than opening a second overlay on top of this one, which
// looked wrong on iOS Safari. Shared by every place a friend's name shows up
// (the Friends list, leaderboard rows, wherever) so tapping a friend always
// gets you here the same way.
export default function FriendStatsModal({ uid, name, onClose }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUserStats(uid), getUserCheckins(uid)])
      .then(([stats, checkins]) => {
        // A "Rate a Landmark" claim (0 points) isn't a visit -- skip it for
        // "most recent check-in", same as the check-ins gallery does.
        const recent = checkins.find((c) => c.points !== 0) || null;
        if (!cancelled) setState({ loading: false, stats, recent });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          {'\u{1F464}'} @{name}
        </h3>
        {state.loading && <p className="screen-subtitle">Loading…</p>}
        {state.error && <p className="screen-subtitle">Could not load their stats — try again.</p>}
        {state.stats && (
          <>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-num">{state.stats.totalPoints.toLocaleString()}</span>
                <span className="profile-stat-label">total pts</span>
              </div>
              <button
                type="button"
                className="profile-stat profile-stat-btn"
                onClick={() => state.stats.checkins && navigate(`/friend/${uid}/checkins`)}
              >
                <span className="profile-stat-num">{state.stats.checkins.toLocaleString()}</span>
                <span className="profile-stat-label">check-ins{state.stats.checkins ? ' ›' : ''}</span>
              </button>
              <button
                type="button"
                className="profile-stat profile-stat-btn"
                onClick={() => state.stats.cities && navigate(`/friend/${uid}/cities`)}
              >
                <span className="profile-stat-num">{state.stats.cities}</span>
                <span className="profile-stat-label">cities{state.stats.cities ? ' ›' : ''}</span>
              </button>
            </div>
            {state.recent ? (
              <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
                Last check-in: <strong>{state.recent.landmarkName || 'a landmark'}</strong>
                {state.recent.region ? ` — ${getRegion(state.recent.region)?.name || ''}` : ''}
              </p>
            ) : (
              <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
                No check-ins yet.
              </p>
            )}
          </>
        )}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
