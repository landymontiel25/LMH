import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getUserCheckins } from '../lib/leaderboard';
import { computeNewPlacesThisWeek } from '../lib/discoveryStats';
import { getTodaysTimeSavedMinutes } from '../lib/timeSaved';

// The headline stat card (item 7/9 of the changelist): discovery and time
// saved lead, points/leaderboard follow further down and smaller. Both
// numbers are real, tracked figures, not copy: new places is a straight
// count of first-time check-ins (discoveryStats.js); minutes saved is
// summed from actually-logged Mapr chat replies that produced stops
// (timeSaved.js), each one comparing its own real generation time against
// a stated manual-planning baseline -- never a guess made up per session.
export default function DiscoveryStatsCard() {
  const { user, firebaseEnabled } = useAuth();
  const [newPlaces, setNewPlaces] = useState(null);
  const [minutesSaved, setMinutesSaved] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setNewPlaces(null);
      setMinutesSaved(null);
      return;
    }
    let cancelled = false;
    getUserCheckins(user.uid).then((checkins) => {
      if (!cancelled) setNewPlaces(computeNewPlacesThisWeek(checkins));
    });
    getTodaysTimeSavedMinutes(user.uid).then((minutes) => {
      if (!cancelled) setMinutesSaved(minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  if (!user) return null;
  if (!newPlaces && !minutesSaved) return null;

  return (
    <div className="card section discovery-stats-card">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {newPlaces > 0 && (
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{newPlaces}</div>
            <div className="screen-subtitle" style={{ margin: 0 }}>
              new {newPlaces === 1 ? 'place' : 'places'} found this week
            </div>
          </div>
        )}
        {minutesSaved > 0 && (
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{minutesSaved}</div>
            <div className="screen-subtitle" style={{ margin: 0 }}>minutes saved planning today</div>
          </div>
        )}
      </div>
    </div>
  );
}
