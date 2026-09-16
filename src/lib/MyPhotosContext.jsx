import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getUserReviewPhotos } from './reviews';
import { getUserCheckins } from './leaderboard';

// Loads the signed-in user's own check-in/review photos once, as
// { [landmarkId]: [photoURL, ...] }, so every landmark thumbnail across the
// app -- list rows, map popups, itinerary stops, the detail page -- can lead
// with YOUR photo instead of the landmark's default one. Private by
// construction: it's read straight from your own review documents, so
// nobody else's view is ever affected.
const MyPhotosContext = createContext(null);

export function MyPhotosProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const [myPhotos, setMyPhotos] = useState({});

  const reload = useCallback(async () => {
    if (!firebaseEnabled || !user) {
      setMyPhotos({});
      return;
    }
    try {
      // Review photos plus any photo saved on the check-in itself -- the
      // check-in one leads, same order the check-ins gallery uses.
      const [fromReviews, checkins] = await Promise.all([
        getUserReviewPhotos(user.uid),
        getUserCheckins(user.uid).catch(() => []),
      ]);
      const map = { ...fromReviews };
      for (const c of checkins) {
        if (c.photoURL && !(map[c.landmarkId] || []).includes(c.photoURL)) {
          map[c.landmarkId] = [c.photoURL, ...(map[c.landmarkId] || [])];
        }
      }
      setMyPhotos(map);
    } catch {
      /* offline / rules not set yet -- leave it empty */
    }
  }, [firebaseEnabled, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return <MyPhotosContext.Provider value={{ myPhotos, reload }}>{children}</MyPhotosContext.Provider>;
}

export function useMyPhotos() {
  const ctx = useContext(MyPhotosContext);
  if (!ctx) throw new Error('useMyPhotos must be used inside MyPhotosProvider');
  return ctx;
}
