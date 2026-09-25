import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { subscribeLeaderboard, cleanName } from '../lib/leaderboard';
import FriendPopoverName from '../components/FriendPopoverName';

const PERIOD_LABEL = { weekly: 'This Week', monthly: 'This Month', yearly: 'This Year' };
const TABS = [
  { id: 'weekly', label: 'This Week' },
  { id: 'monthly', label: 'This Month' },
  { id: 'yearly', label: 'This Year' },
];

// A dedicated page (not a modal) for the complete ranked list -- reachable
// via "See Full List" next to the Leaderboard heading on Profile, and
// bookmarkable/shareable on its own since the period is a query param.
export default function FullLeaderboard() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = TABS.some((t) => t.id === searchParams.get('period')) ? searchParams.get('period') : 'weekly';
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeLeaderboard(period, (data) => {
      setEntries(data);
      setLoading(false);
    }, 200);
    return unsub;
  }, [period, firebaseEnabled]);

  const displayFor = (e) => (user && e.userId === user.uid && myUsername ? myUsername : cleanName(e.userName));

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        {'← Back'}
      </button>

      <h1 className="screen-title">
        <span>{'\u{1F3C6}'}</span> Full Leaderboard
      </h1>

      <div className="tabs" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${period === t.id ? 'active' : ''}`}
            onClick={() => setSearchParams({ period: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!firebaseEnabled && (
        <div className="empty-state">
          <p>Leaderboards aren't configured yet.</p>
        </div>
      )}

      {firebaseEnabled && loading && <p className="screen-subtitle">Loading rankings…</p>}

      {firebaseEnabled && !loading && entries.length === 0 && (
        <div className="empty-state">
          <p>No points yet {PERIOD_LABEL[period].toLowerCase()} — check in to be first!</p>
        </div>
      )}

      {firebaseEnabled &&
        !loading &&
        entries.map((e, idx) => (
          <div key={e.id} className={`leaderboard-row ${user && e.userId === user.uid ? 'me' : ''}`}>
            <div className="leaderboard-rank">#{idx + 1}</div>
            <div style={{ flex: 1 }}>
              <FriendPopoverName userId={e.userId} fallbackName={displayFor(e)}>
                {displayFor(e)}
              </FriendPopoverName>
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-brass-bright)', fontWeight: 700 }}>
              {e.points.toLocaleString()} pts
            </div>
          </div>
        ))}
    </div>
  );
}
