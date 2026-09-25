import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUserStats } from '../lib/leaderboard';
import { getUserProfile } from '../lib/friends';
import CityList from '../components/CityList';
import { Building2 as Building2Icon } from 'lucide-react';

// A friend's cities list as its own page, reached from FriendStats' "cities"
// tile -- self-sufficient (fetches its own name/stats) so it survives a
// direct link or a browser refresh, not just in-app navigation.
export default function FriendCities() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, s] = await Promise.all([getUserProfile(uid), getUserStats(uid)]);
        if (cancelled) return;
        setName(profile?.username || 'this user');
        setStats(s);
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
        <span><Building2Icon aria-hidden="true" /></span> @{name || '…'}'s Cities
      </h1>
      {error && <p className="screen-subtitle">Could not load their cities — try again.</p>}
      {!error && !stats && <p className="screen-subtitle">Loading…</p>}
      {stats && <CityList cityIds={stats.cityIds} cityPoints={stats.cityPoints} cityLastVisit={stats.cityLastVisit} />}
    </div>
  );
}
