import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUserStats, getUserCheckins } from '../lib/leaderboard';
import { getUserProfile } from '../lib/friends';
import { getRegion } from '../data/regions';
import CityList from '../components/CityList';
import CheckinsGallery from '../components/CheckinsGallery';

// A friend's stats as a real page, not a modal -- a modal-backdrop/modal-card
// stacked over the Profile screen rendered oddly on iOS Safari, and tapping
// into their check-ins used to mean drilling into ANOTHER modal on top of
// that one. This mirrors FullStats (your own equivalent page): one scrollable
// screen, no overlays, reached via /friend/:uid from a tap on the Friends list.
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
        <>
          {recent ? (
            <p className="screen-subtitle" style={{ marginTop: -8 }}>
              Last check-in: <strong>{recent.landmarkName || 'a landmark'}</strong>
              {recent.region ? ` — ${getRegion(recent.region)?.name || ''}` : ''}
            </p>
          ) : (
            <p className="screen-subtitle" style={{ marginTop: -8 }}>No check-ins yet.</p>
          )}

          <div className="card section">
            <h3 style={{ marginTop: 0 }}>
              {'\u{1F3D9}\u{FE0F}'} Cities ({stats.cities})
            </h3>
            <CityList cityIds={stats.cityIds} cityPoints={stats.cityPoints} cityLastVisit={stats.cityLastVisit} />
          </div>

          <CheckinsGallery
            user={{ uid }}
            claimedMap={{}}
            navigate={navigate}
            totalPoints={stats.totalPoints}
            title={`@${name}'s Check-ins`}
          />
        </>
      )}
    </div>
  );
}
