import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchSavedPreferences, pushSavedPreferences } from './preferences';

const STORAGE_KEY = 'landmarkhunters.trip.v1';

const DEFAULT_TRIP = {
  startingLocation: '',
  startingCoords: null,
  activeRegion: null, // city currently being browsed (Setup / Landmarks context)
  interests: [],
  customInterests: [],
  // { [customInterestText]: string[] of "regionId/landmarkId" } — which landmarks
  // the AI decided fit a free-text interest like "nightlife" or "racing", since
  // those don't map to any of the built-in categories on their own.
  customInterestMatches: {},
  // "My Preferences" on Profile -- your usual picks, saved once so Setup can
  // fill interests/customInterests in with one tap instead of re-choosing
  // them on every trip. Independent of the live trip.interests below.
  savedInterests: [],
  savedCustomInterests: [],
  byRegion: {}, // { [regionId]: string[] of landmark ids } — one itinerary per city
};

function loadTrip() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRIP;
    const parsed = JSON.parse(raw);
    const t = { ...DEFAULT_TRIP, ...parsed };
    // Migrate the old single-city model (region + selectedLandmarkIds) → byRegion map.
    if (!parsed.byRegion) {
      t.byRegion = parsed.region && parsed.selectedLandmarkIds?.length
        ? { [parsed.region]: parsed.selectedLandmarkIds }
        : {};
      t.activeRegion = parsed.region ?? null;
    }
    t.byRegion = t.byRegion || {};
    return t;
  } catch {
    return DEFAULT_TRIP;
  }
}

const TripContext = createContext(null);

export function TripProvider({ children }) {
  const { user, firebaseEnabled } = useAuth();
  const [trip, setTrip] = useState(loadTrip);
  // Which city the Map should frame — set only when you actively view a city
  // this session (list / detail / itinerary). Deliberately NOT persisted, so a
  // fresh app launch falls back to your GPS location instead of the last city.
  const [mapFocus, setMapFocus] = useState(null);
  // One-shot "fly to this exact landmark" request from a detail page — {lat,lng}.
  const [mapFocusPoint, setMapFocusPoint] = useState(null);
  // Set right after pulling saved preferences down from the account, so the
  // very next write-back effect run (which that pull itself triggers) skips
  // echoing the same data straight back up to Firestore.
  const skipNextPushRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  }, [trip]);

  // "My Preferences" needs to follow the account, not just this browser --
  // otherwise it looks like it vanished in a private window, a different
  // device, or after clearing site data. Firestore is the source of truth
  // once signed in; local storage is just the offline/signed-out fallback.
  useEffect(() => {
    if (!firebaseEnabled || !user) return;
    let cancelled = false;
    fetchSavedPreferences(user.uid).then((saved) => {
      if (cancelled || !saved) return;
      skipNextPushRef.current = true;
      setTrip((t) => ({ ...t, ...saved }));
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, user]);

  useEffect(() => {
    if (!firebaseEnabled || !user) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    pushSavedPreferences(user.uid, {
      savedInterests: trip.savedInterests,
      savedCustomInterests: trip.savedCustomInterests,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.savedInterests, trip.savedCustomInterests, firebaseEnabled, user]);

  const updateTrip = (patch) => setTrip((t) => ({ ...t, ...patch }));

  // Records which landmarks the AI matched to a custom interest, once classified.
  const setCustomInterestMatches = (text, ids) =>
    setTrip((t) => ({ ...t, customInterestMatches: { ...t.customInterestMatches, [text]: ids } }));

  const removeCustomInterest = (text) =>
    setTrip((t) => {
      const customInterestMatches = { ...t.customInterestMatches };
      delete customInterestMatches[text];
      return {
        ...t,
        customInterests: t.customInterests.filter((i) => i !== text),
        customInterestMatches,
      };
    });

  // Add/remove a landmark within its own city's itinerary (never touches other cities).
  const toggleLandmark = (id, regionId) => {
    setTrip((t) => {
      const cur = t.byRegion[regionId] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const byRegion = { ...t.byRegion };
      if (next.length) byRegion[regionId] = next;
      else delete byRegion[regionId];
      return { ...t, byRegion, activeRegion: regionId };
    });
  };

  // Replace a city's whole selection (used by "Suggest For Me" / "Clear").
  const setRegionSelection = (regionId, ids) => {
    setTrip((t) => {
      const byRegion = { ...t.byRegion };
      if (ids.length) byRegion[regionId] = ids;
      else delete byRegion[regionId];
      return { ...t, byRegion, activeRegion: regionId };
    });
  };

  const clearRegion = (regionId) =>
    setTrip((t) => {
      const byRegion = { ...t.byRegion };
      delete byRegion[regionId];
      return { ...t, byRegion };
    });

  const clearAll = () => setTrip((t) => ({ ...t, byRegion: {} }));

  const toggleSavedInterest = (id) =>
    setTrip((t) => ({
      ...t,
      savedInterests: t.savedInterests.includes(id) ? t.savedInterests.filter((i) => i !== id) : [...t.savedInterests, id],
    }));

  const addSavedCustomInterest = (text) =>
    setTrip((t) => (t.savedCustomInterests.includes(text) ? t : { ...t, savedCustomInterests: [...t.savedCustomInterests, text] }));

  const removeSavedCustomInterest = (text) =>
    setTrip((t) => ({ ...t, savedCustomInterests: t.savedCustomInterests.filter((x) => x !== text) }));

  // One tap on Setup: replace the live trip interests with your saved ones.
  const applyPreferences = () =>
    setTrip((t) => ({ ...t, interests: [...t.savedInterests], customInterests: [...t.savedCustomInterests] }));

  const getRegionSelection = (regionId) => trip.byRegion[regionId] || [];

  const regionsWithItineraries = () =>
    Object.keys(trip.byRegion).filter((r) => trip.byRegion[r]?.length);

  const resetTrip = () => setTrip(DEFAULT_TRIP);

  return (
    <TripContext.Provider
      value={{
        trip,
        updateTrip,
        toggleLandmark,
        setRegionSelection,
        clearRegion,
        clearAll,
        getRegionSelection,
        regionsWithItineraries,
        resetTrip,
        setCustomInterestMatches,
        removeCustomInterest,
        toggleSavedInterest,
        addSavedCustomInterest,
        removeSavedCustomInterest,
        applyPreferences,
        mapFocus,
        setMapFocus,
        mapFocusPoint,
        setMapFocusPoint,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}
