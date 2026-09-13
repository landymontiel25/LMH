import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';
import { useCheckIn } from './useCheckIn';
import { getUserStats, getUserCheckins } from './leaderboard';
import { computeStreakDays, computeBadges } from './streaks';

// Your check-in/city/streak counts and the badges earned from them --
// shared by Profile's "Your Stats" pills and the Full Stats page so both
// stay consistent and only one place persists a badge's first-earned time
// (users/{uid}.badgeEarnedAt), which Full Stats uses to sort by "Recent"/
// "Oldest". A badge earned before this existed just gets stamped the first
// time this hook notices it -- there's no earlier date to recover.
export function useBadges() {
  const { user, firebaseEnabled } = useAuth();
  const { claimedMap } = useCheckIn();
  const { myProfile, reload: reloadFriends } = useFriends();
  const [stats, setStats] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setStats(null);
      setStreakDays(0);
      setBadges([]);
      return;
    }
    let cancelled = false;
    (async () => {
      let s;
      try {
        s = await getUserStats(user.uid);
      } catch {
        s = { totalPoints: 0, checkins: 0, cities: 0 };
      }
      if (cancelled) return;
      setStats(s);
      try {
        const rows = await getUserCheckins(user.uid);
        if (cancelled) return;
        const days = computeStreakDays(rows);
        setStreakDays(days);
        setBadges(computeBadges({ checkinsCount: s.checkins, citiesCount: s.cities, streakDays: days }));
      } catch {
        if (!cancelled) {
          setStreakDays(0);
          setBadges([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, user, claimedMap]);

  // Wait for a real profile read (not just `user` existing) before deciding
  // what's "new" -- otherwise a still-loading myProfile looks like nothing
  // is recorded yet, and every already-earned badge would get re-stamped
  // with today's date on every page load.
  useEffect(() => {
    if (!user || !myProfile || badges.length === 0) return;
    const known = myProfile.badgeEarnedAt || {};
    const fresh = badges.filter((b) => !known[b.id]);
    if (fresh.length === 0) return;
    const patch = {};
    for (const b of fresh) patch[`badgeEarnedAt.${b.id}`] = serverTimestamp();
    updateDoc(doc(db, 'users', user.uid), patch)
      .then(() => reloadFriends())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, badges, myProfile]);

  return { stats, streakDays, badges, badgeEarnedAt: myProfile?.badgeEarnedAt || {} };
}
