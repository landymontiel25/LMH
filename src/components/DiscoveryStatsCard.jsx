import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getUserCheckins } from '../lib/leaderboard';
import { computeDiscoveryStats } from '../lib/discoveryStats';

// The headline stat card (item 7 of the changelist): discovery and time
// saved lead, points/leaderboard follow further down and smaller. "3 new
// places found this week" and "12 minutes saved planning today" say what
// Mapr is actually for -- finding you good places fast -- in a way a point
// total never does.
export default function DiscoveryStatsCard() {
  const { user, firebaseEnabled } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setStats(null);
      return;
    }
    let cancelled = false;
    getUserCheckins(user.uid).then((checkins) => {
      if (!cancelled) setStats(computeDiscoveryStats(checkins));
    });
    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  if (!user || !stats) return null;
  if (!stats.newPlacesThisWeek && !stats.minutesSavedToday) return null;

  return (
    <div className="card section discovery-stats-card">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {stats.newPlacesThisWeek > 0 && (
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats.newPlacesThisWeek}</div>
            <div className="screen-subtitle" style={{ margin: 0 }}>
              new {stats.newPlacesThisWeek === 1 ? 'place' : 'places'} found this week
            </div>
          </div>
        )}
        {stats.minutesSavedToday > 0 && (
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats.minutesSavedToday}</div>
            <div className="screen-subtitle" style={{ margin: 0 }}>minutes saved planning today</div>
          </div>
        )}
      </div>
    </div>
  );
}
