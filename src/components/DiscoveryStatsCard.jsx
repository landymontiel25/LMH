import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getTodaysTimeSavedMinutes } from '../lib/timeSaved';

// The headline stat card: time saved leads, points/leaderboard follow
// further down and smaller. A real, tracked figure, not copy -- summed
// from actually-logged Mapr chat replies that produced stops
// (timeSaved.js), each one comparing its own real generation time against
// a stated manual-planning baseline, never a guess made up per session.
export default function DiscoveryStatsCard() {
  const { user, firebaseEnabled } = useAuth();
  const [minutesSaved, setMinutesSaved] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setMinutesSaved(null);
      return;
    }
    let cancelled = false;
    getTodaysTimeSavedMinutes(user.uid).then((minutes) => {
      if (!cancelled) setMinutesSaved(minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  if (!user || !minutesSaved) return null;

  return (
    <div className="card section discovery-stats-card">
      <div className="stat-label">Today</div>
      <div className="stat-row">
        <span className="stat-num">{minutesSaved}</span>
        <span className="stat-unit">min</span>
      </div>
      <div className="stat-sub">saved planning today</div>
    </div>
  );
}
