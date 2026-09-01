import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAllRatings } from './reviews';
import { firebaseEnabled } from './firebase';

// Loads every landmark's aggregate user rating once and shares it, so cards,
// the Top Rated sort, and detail pages all read from one place.
const RatingsContext = createContext(null);

export function RatingsProvider({ children }) {
  const [ratings, setRatings] = useState({});

  const reload = useCallback(async () => {
    if (!firebaseEnabled) return;
    try {
      setRatings(await getAllRatings());
    } catch {
      /* offline / rules — leave ratings empty */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <RatingsContext.Provider value={{ ratings, reload }}>{children}</RatingsContext.Provider>;
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used inside RatingsProvider');
  return ctx;
}
