import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';
import { useCheckIn } from './useCheckIn';
import { getUserStats, getUserCheckins } from './leaderboard';
import { computeStreakDays, computeBadges, hasCheckedInToday } from './streaks';

// Your check-in/city/streak counts and the badges earned from them -- one
// shared fetch + one shared "what's newly earned" detector, so Profile's
// badge pills, Full Stats, and the celebration popup (CelebrationOverlay)
// all agree on the same state instead of racing three independent copies
// of this same logic against the same badgeEarnedAt write.
const BadgesContext = createContext(null);

export function BadgesProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const { claimedMap } = useCheckIn();
  const { myProfile, reload: reloadFriends } = useFriends();
  const [stats, setStats] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  // Badges this session has seen freshly persisted (not yet in
  // myProfile.badgeEarnedAt at the moment they were computed) -- consumed
  // by CelebrationOverlay, which dismisses each one after showing it.
  const [justEarned, setJustEarned] = useState([]);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setStats(null);
      setStreakDays(0);
      setCheckedInToday(false);
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
        setStreakDays(computeStreakDays(rows));
        setCheckedInToday(hasCheckedInToday(rows));
      } catch {
        if (!cancelled) {
          setStreakDays(0);
          setCheckedInToday(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, user, claimedMap]);

  // Derived from state rather than fetched separately, so completing
  // onboarding (which flips myProfile.onboardingCompleted, not the
  // check-in history) surfaces the Welcome badge immediately, with no
  // extra Firestore reads.
  const badges = useMemo(() => {
    if (!stats) return [];
    return computeBadges({
      checkinsCount: stats.checkins,
      citiesCount: stats.cities,
      streakDays,
      onboardingCompleted: !!myProfile?.onboardingCompleted,
    });
  }, [stats, streakDays, myProfile?.onboardingCompleted]);

  // Wait for a real profile read (not just `user` existing) before deciding
  // what's "new" -- otherwise a still-loading myProfile looks like nothing
  // is recorded yet, and every already-earned badge would get re-stamped
  // (and re-celebrated) on every load.
  useEffect(() => {
    if (!user || !myProfile || badges.length === 0) return;
    const known = myProfile.badgeEarnedAt || {};
    const fresh = badges.filter((b) => !known[b.id]);
    if (fresh.length === 0) return;
    const patch = {};
    for (const b of fresh) patch[`badgeEarnedAt.${b.id}`] = serverTimestamp();
    updateDoc(doc(db, 'users', user.uid), patch)
      .then(() => {
        // Dedupe against whatever's already queued -- guards a fast second
        // check-in whose "fresh" detection runs before myProfile reflects
        // this write, which would otherwise queue the same badge twice.
        setJustEarned((cur) => {
          const known = new Set(cur.map((b) => b.id));
          const additions = fresh.filter((b) => !known.has(b.id));
          return additions.length ? [...cur, ...additions] : cur;
        });
        reloadFriends();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, badges, myProfile]);

  const dismissJustEarned = (id) => setJustEarned((cur) => cur.filter((b) => b.id !== id));

  const value = useMemo(
    () => ({
      stats,
      streakDays,
      checkedInToday,
      badges,
      badgeEarnedAt: myProfile?.badgeEarnedAt || {},
      justEarned,
      dismissJustEarned,
    }),
    [stats, streakDays, checkedInToday, badges, myProfile?.badgeEarnedAt, justEarned]
  );

  return <BadgesContext.Provider value={value}>{children}</BadgesContext.Provider>;
}

export function useBadges() {
  const ctx = useContext(BadgesContext);
  if (!ctx) throw new Error('useBadges must be used inside BadgesProvider');
  return ctx;
}
