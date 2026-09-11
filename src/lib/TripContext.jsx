import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'landmarkhunters.trip.v1';

const DEFAULT_TRIP = {
  startingLocation: '',
  startingCoords: null,
  activeRegion: null, // city currently being browsed (Setup / Landmarks context)
  interests: [],
  customInterests: [],
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
