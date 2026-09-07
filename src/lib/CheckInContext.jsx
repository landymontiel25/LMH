import { createContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';
import {
  claimCheckIn,
  removeCheckIn as removeCheckInDoc,
  getUserCheckedInLandmarkIds,
  subscribeLeaderboard,
  attachCheckinPhoto,
  POINTS_PER_CHECKIN,
} from './leaderboard';

// Shared check-in state so there's ONE source of truth and a single place to
// trigger the post-check-in "rate + add a photo" prompt, no matter which screen
// you checked in from (map pin, itinerary, landmark list, or detail page).
export const CheckInContext = createContext(null);

export function CheckInProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const [claimedMap, setClaimedMap] = useState({});
  const [checkingIn, setCheckingIn] = useState(null);
  const [justCheckedIn, setJustCheckedIn] = useState(null);
  // The photo the user snapped/picked to check in — required, and carried into
  // the rate + review prompt so it's already attached.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  // The "+100! You passed Eduardo — now #1 👑" payoff shown after a check-in.
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

  const checkIn = async (landmark, photoFile = null) => {
    if (!user) return;
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
      // Fresh check-in → carry the photo into the rate + review prompt, and
      // work out the overtake payoff from where you stood a moment ago.
      if (result.claimed) {
        const pts = landmark.points ?? POINTS_PER_CHECKIN;
        setCelebration(buildCelebration(pts));
        setPendingPhoto(photoFile || null);
        setJustCheckedIn(landmark);
        // Save the check-in photo right away so it's kept even if the user skips
        // the star rating. Fire-and-forget.
        if (photoFile) attachCheckinPhoto(user.uid, landmark.id, photoFile).catch(() => {});
      }
    } finally {
      setCheckingIn(null);
    }
  };

  const clearJustCheckedIn = () => {
    setJustCheckedIn(null);
    setPendingPhoto(null);
    setCelebration(null);
  };

  // TEMPORARY: undo a check-in (see removeCheckIn in lib/leaderboard) — a
  // cleanup tool for mis-taps during testing, remove once no longer needed.
  const removeCheckIn = async (landmarkId) => {
    if (!user) return;
    await removeCheckInDoc({ userId: user.uid, landmarkId });
    setClaimedMap((m) => {
      const next = { ...m };
      delete next[landmarkId];
      return next;
    });
  };

  return (
    <CheckInContext.Provider
      value={{
        user,
        firebaseEnabled,
        claimedMap,
        checkingIn,
        checkIn,
        removeCheckIn,
        justCheckedIn,
        pendingPhoto,
        celebration,
        clearJustCheckedIn,
      }}
    >
      {children}
    </CheckInContext.Provider>
  );
}
