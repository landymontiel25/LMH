import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getLandmarkEdits } from './landmarkOverrides';

const LandmarkEditsContext = createContext(null);

// Admin Mode's live corrections to built-in landmarks -- loaded once,
// app-wide, so every screen that shows a static catalog landmark (map,
// detail page, landmark list) can apply the same patch instead of each
// fetching/merging it separately. Small, rarely-changing collection
// (nothing here happens except when the admin edits something), so one
// shared load is plenty -- no per-screen re-fetching.
export function LandmarkEditsProvider({ children }) {
  const [edits, setEdits] = useState({});

  const reload = useCallback(() => {
    getLandmarkEdits()
      .then(setEdits)
      .catch(() => {
        /* offline / rules not deployed yet -- landmarks just show their static data */
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Applies a live edit (if any) on top of a built-in landmark object.
  // Safe to call with null/undefined -- returns it unchanged.
  const applyEdit = useCallback(
    (landmark) => {
      if (!landmark) return landmark;
      const edit = edits[`${landmark.regionId}/${landmark.id}`];
      return edit ? { ...landmark, ...edit } : landmark;
    },
    [edits]
  );

  return (
    <LandmarkEditsContext.Provider value={{ edits, applyEdit, reload }}>{children}</LandmarkEditsContext.Provider>
  );
}

export function useLandmarkEdits() {
  const ctx = useContext(LandmarkEditsContext);
  if (!ctx) throw new Error('useLandmarkEdits must be used inside LandmarkEditsProvider');
  return ctx;
}
