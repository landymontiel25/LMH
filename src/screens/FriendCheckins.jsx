import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUserStats } from '../lib/leaderboard';
import { getUserProfile } from '../lib/friends';
import CheckinsGallery from '../components/CheckinsGallery';

// A friend's check-ins gallery as its own page, reached from FriendStats'
// "check-ins" tile -- self-sufficient (fetches its own name/points) so it
// survives a direct link or a browser refresh, not just in-app navigation.
export default function FriendCheckins() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [totalPoints, setTotalPoints] = useState(0);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, stats] = await Promise.all([getUserProfile(uid), getUserStats(uid)]);
        if (cancelled) return;
        setName(profile?.username || 'this user');
        setTotalPoints(stats.totalPoints);
        setLoaded(true);
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
      {error && <p className="screen-subtitle">Could not load their check-ins — try again.</p>}
      {!error && !loaded && <p className="screen-subtitle">Loading…</p>}
      {loaded && (
        <CheckinsGallery
          user={{ uid }}
          claimedMap={{}}
          navigate={navigate}
          totalPoints={totalPoints}
          title={`@${name}'s Check-ins`}
        />
      )}
    </div>
  );
}
