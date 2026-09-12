import { createContext, useContext, useEffect, useState } from 'react';

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
  // { [customInterestText]: emoji } -- one emoji the AI picked to represent
  // that free-text interest (e.g. "racing" -> a race car), chosen alongside
  // its landmark matches so the chip shows something more specific than a
  // generic sparkle.
  customInterestEmoji: {},
  // "My Preferences" on Profile -- your usual picks, saved once so Setup can
  // fill interests/customInterests in with one tap instead of re-choosing
  // them on every trip. Independent of the live trip.interests below.
  savedInterests: [],
  savedCustomInterests: [],
  // Custom preference chips you've turned off without deleting -- "Use My
  // Preferences" skips these, same as an unchecked built-in category, but
  // the chip stays put so you can turn it back on later.
  deselectedCustomInterests: [],
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
  const [trip, setTrip] = useState(loadTrip);
  // Which city the Map should frame — set only when you actively view a city
  // this session (list / detail / itinerary). Deliberately NOT persisted, so a
  // fresh app launch falls back to your GPS location instead of the last city.
  const [mapFocus, setMapFocus] = useState(null);
  // One-shot "fly to this exact landmark" request from a detail page — {lat,lng}.
  const [mapFocusPoint, setMapFocusPoint] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  }, [trip]);

  const updateTrip = (patch) => setTrip((t) => ({ ...t, ...patch }));

  // Records which landmarks the AI matched to a custom interest, once classified.
  const setCustomInterestMatches = (text, ids) =>
    setTrip((t) => ({ ...t, customInterestMatches: { ...t.customInterestMatches, [text]: ids } }));

  const setCustomInterestEmoji = (text, emoji) =>
    setTrip((t) => ({ ...t, customInterestEmoji: { ...t.customInterestEmoji, [text]: emoji } }));

  const removeCustomInterest = (text) =>
    setTrip((t) => {
      const customInterestMatches = { ...t.customInterestMatches };
      delete customInterestMatches[text];
      const customInterestEmoji = { ...t.customInterestEmoji };
      delete customInterestEmoji[text];
      return {
        ...t,
        customInterests: t.customInterests.filter((i) => i !== text),
        customInterestMatches,
        customInterestEmoji,
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
    setTrip((t) => ({
      ...t,
      savedCustomInterests: t.savedCustomInterests.filter((x) => x !== text),
      deselectedCustomInterests: t.deselectedCustomInterests.filter((x) => x !== text),
    }));

  // Turns a saved custom interest chip on/off without deleting it -- mirrors
  // toggleSavedInterest's on/off for the built-in categories.
  const toggleSavedCustomInterestSelected = (text) =>
    setTrip((t) => ({
      ...t,
      deselectedCustomInterests: t.deselectedCustomInterests.includes(text)
        ? t.deselectedCustomInterests.filter((x) => x !== text)
        : [...t.deselectedCustomInterests, text],
    }));

  // One tap on Setup: replace the live trip interests with your saved ones
  // (skipping any custom ones you've turned off).
  const applyPreferences = () =>
    setTrip((t) => ({
      ...t,
      interests: [...t.savedInterests],
      customInterests: t.savedCustomInterests.filter((x) => !t.deselectedCustomInterests.includes(x)),
    }));

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
        setCustomInterestEmoji,
        removeCustomInterest,
        toggleSavedInterest,
        addSavedCustomInterest,
        removeSavedCustomInterest,
        toggleSavedCustomInterestSelected,
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
