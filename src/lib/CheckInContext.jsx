import { createContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';
import { claimCheckIn, getUserCheckedInLandmarkIds, subscribeLeaderboard, POINTS_PER_CHECKIN } from './leaderboard';

// Shared check-in state so there's ONE source of truth and a single place to
// trigger the "rate + post" prompt, no matter which screen you checked in
// from (map pin, itinerary, landmark list, or detail page).
export const CheckInContext = createContext(null);

export function CheckInProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const [claimedMap, setClaimedMap] = useState({});
  const [checkingIn, setCheckingIn] = useState(null);
  // The landmark currently in the rate + post prompt. Tapping "Check In" sets
  // this immediately, but nothing is claimed/awarded yet — that only happens
  // once the user taps Post (see commitCheckIn below).
  const [justCheckedIn, setJustCheckedIn] = useState(null);
  // Per-call flags for the rate + post prompt that follows -- e.g. Rate a
  // Landmark (search-first, no physical visit) requires a comment; a normal
  // Check In tap doesn't. Reset alongside justCheckedIn so a stale flag
  // never leaks into the next check-in.
  const [checkInOptions, setCheckInOptions] = useState({});
  // The "+100! You passed Eduardo — now #1 👑" payoff shown after posting.
  const [celebration, setCelebration] = useState(null);

  // Keep this week's standings warm so we can detect an overtake the instant a
  // check-in lands (compare where you were vs where +100 puts you).
  const boardRef = useRef([]);
  useEffect(() => {
    if (!user || !firebaseEnabled) {
      boardRef.current = [];
      return;
    }
    const unsub = subscribeLeaderboard('weekly', (entries) => {
      boardRef.current = entries;
    });
    return unsub;
  }, [user, firebaseEnabled]);

  useEffect(() => {
    if (!user || !firebaseEnabled) {
      setClaimedMap({});
      return;
    }
    let cancelled = false;
    getUserCheckedInLandmarkIds(user.uid).then((ids) => {
      if (!cancelled) setClaimedMap(Object.fromEntries(ids.map((id) => [id, true])));
    });
    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  // Compare the week's board before vs after this +points check-in and build a
  // celebratory line if the user climbed past anyone.
  const buildCelebration = (points) => {
    const entries = boardRef.current || [];
    const others = entries.filter((e) => e.userId !== user.uid);
    const mine = entries.find((e) => e.userId === user.uid);
    const before = mine ? mine.points : 0;
    const after = before + points;
    const oldRank = 1 + others.filter((e) => e.points > before).length;
    const newRank = 1 + others.filter((e) => e.points > after).length;
    const improved = newRank < oldRank;
    const overtaken = improved
      ? others.filter((e) => e.points >= before && e.points < after).sort((a, b) => b.points - a.points)
      : [];
    const passed = overtaken[0] || null;

    let message = null;
    if (improved && newRank === 1) {
      message = passed ? `You passed ${passed.userName} — you're #1 now! 👑` : `You're #1 now! 👑`;
    } else if (passed) {
      message = `You passed ${passed.userName} — now #${newRank}! 🔥`;
    }
    return { points, rank: newRank, message };
  };

  // Opens the rate + post prompt for this landmark. No Firestore write here.
  const checkIn = (landmark, options = {}) => {
    if (!user) return;
    setJustCheckedIn(landmark);
    setCheckInOptions(options);
  };

  // The actual check-in: called from the Post button, this is the moment
  // points are awarded and the landmark is marked claimed.
  const commitCheckIn = async () => {
    const landmark = justCheckedIn;
    if (!user || !landmark) return null;
    setCheckingIn(landmark.id);
    try {
      const result = await claimCheckIn({
        userId: user.uid,
        // Never store the email on public leaderboards — prefer the username.
        userName: myUsername || user.displayName || 'Explorer',
        landmarkId: landmark.id,
        landmarkName: landmark.name,
        region: landmark.regionId ?? landmark.region,
        points: landmark.points ?? POINTS_PER_CHECKIN,
      });
      if (result.claimed || result.alreadyClaimed) {
        setClaimedMap((m) => ({ ...m, [landmark.id]: true }));
      }
      if (result.claimed) {
        const pts = landmark.points ?? POINTS_PER_CHECKIN;
        setCelebration(buildCelebration(pts));
      }
      return result;
    } finally {
      setCheckingIn(null);
    }
  };

  // Closes the prompt. If Post was never tapped, nothing was ever claimed —
  // this is a true cancel, not a "skip the rating but keep the check-in".
  const clearJustCheckedIn = () => {
    setJustCheckedIn(null);
    setCelebration(null);
    setCheckInOptions({});
  };

  return (
    <CheckInContext.Provider
      value={{
        user,
        firebaseEnabled,
        claimedMap,
        checkingIn,
        checkIn,
        commitCheckIn,
        justCheckedIn,
        checkInOptions,
        celebration,
        clearJustCheckedIn,
      }}
    >
      {children}
    </CheckInContext.Provider>
  );
}
