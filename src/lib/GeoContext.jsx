import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// One shared live location for the whole app, so a single "Refresh" control can
// update every distance on screen at once (instead of each screen watching alone).
const GeoContext = createContext(null);

const readPos = (pos) => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
});

export function GeoProvider({ children }) {
  const [state, setState] = useState({ coords: null, error: null, loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const watchId = useRef(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({ coords: null, error: 'Geolocation is not supported on this device.', loading: false });
      return;
    }
    const onSuccess = (pos) => setState({ coords: readPos(pos), error: null, loading: false });
    const onError = (err) => setState((s) => ({ ...s, error: err.message || 'Unable to get your location.', loading: false }));
    watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  // Force a brand-new GPS fix (maximumAge: 0) — used by the header Refresh button.
  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({ coords: readPos(pos), error: null, loading: false });
        setRefreshing(false);
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message || 'Unable to get your location.', loading: false }));
        setRefreshing(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  return <GeoContext.Provider value={{ ...state, refresh, refreshing }}>{children}</GeoContext.Provider>;
}

export function useGeo() {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error('useGeo must be used inside GeoProvider');
  return ctx;
}
