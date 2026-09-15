import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAllRatings, getUserReviews } from './reviews';
import { firebaseEnabled } from './firebase';
import { useAuth } from './AuthContext';

// Loads every landmark's aggregate user rating once and shares it, so cards,
// the Top Rated sort, and detail pages all read from one place. Also holds
// the signed-in user's own reviews keyed by landmarkId, so anything showing
// a "Rated" state (the Rate pill, the landmark page) can check without a
// read per landmark. Both refresh together via reload() after a save.
const RatingsContext = createContext(null);

export function RatingsProvider({ children }) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState({});
  const [myReviews, setMyReviews] = useState({});

  const reload = useCallback(async () => {
    if (!firebaseEnabled) return;
    try {
      setRatings(await getAllRatings());
    } catch {
      /* offline / rules — leave ratings empty */
    }
    if (!user) {
      setMyReviews({});
      return;
    }
    try {
      const list = await getUserReviews(user.uid);
      setMyReviews(Object.fromEntries(list.map((r) => [r.landmarkId, r])));
    } catch {
      /* leave whatever we had */
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return <RatingsContext.Provider value={{ ratings, myReviews, reload }}>{children}</RatingsContext.Provider>;
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used inside RatingsProvider');
  return ctx;
}
