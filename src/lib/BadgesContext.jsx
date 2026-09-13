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

// Belt-and-suspenders against the "same badge celebrates again" bug, which
// has come back more than once from timing races upstream (a cache read,
// a re-fetch, a user-reference change) that looked fixed each time but
// weren't exhaustively provable. This is a hard, unconditional guarantee
// instead of one more attempt to get the race exactly right: once a
// badge has ever been queued for celebration on this device for this
// account, it is never queued again -- permanently, regardless of what
// upstream state does. Deliberately per-device (localStorage, not
// Firestore) since the goal is just "never show this popup twice here."
const CELEBRATED_PREFIX = 'landmarkhunters.celebrated.';
function hasCelebrated(uid, badgeId) {
  try {
    return localStorage.getItem(`${CELEBRATED_PREFIX}${uid}.${badgeId}`) === '1';
  } catch {
    return false;
  }
}
function markCelebrated(uid, badgeId) {
  try {
    localStorage.setItem(`${CELEBRATED_PREFIX}${uid}.${badgeId}`, '1');
  } catch {
    /* storage full/disabled -- non-fatal, this guard just gets skipped */
  }
}

export function BadgesProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const { claimedMap } = useCheckIn();
  const { myProfile, profileFresh, reload: reloadFriends } = useFriends();
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
    if (!user || !profileFresh || badges.length === 0) return;
    const known = myProfile.badgeEarnedAt || {};
    const fresh = badges.filter((b) => !known[b.id] && !hasCelebrated(user.uid, b.id));
    if (fresh.length === 0) return;
    const patch = {};
    for (const b of fresh) patch[`badgeEarnedAt.${b.id}`] = serverTimestamp();
    updateDoc(doc(db, 'users', user.uid), patch)
      .then(() => {
        for (const b of fresh) markCelebrated(user.uid, b.id);
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
  }, [user, profileFresh, badges, myProfile]);

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
