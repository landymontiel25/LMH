import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';

// One shared live location for the whole app, so a single "Refresh" control can
// update every distance on screen at once (instead of each screen watching alone).
// Geolocation goes through Capacitor's plugin rather than navigator.geolocation
// directly -- on iOS/Android that's the real native location API (falls back to
// the same browser API under the hood when running on the web).
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
    let cancelled = false;
    const onSuccess = (pos) => setState({ coords: readPos(pos), error: null, loading: false });
    const onError = (err) => setState((s) => ({ ...s, error: err?.message || 'Unable to get your location.', loading: false }));
    Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, (pos, err) => {
      if (err) onError(err);
      else if (pos) onSuccess(pos);
    })
      .then((id) => {
        if (cancelled) Geolocation.clearWatch({ id });
        else watchId.current = id;
      })
      .catch((err) => onError(err));
    return () => {
      cancelled = true;
      if (watchId.current != null) Geolocation.clearWatch({ id: watchId.current });
    };
  }, []);

  // Force a brand-new GPS fix (maximumAge: 0) — used by the header Refresh button.
  const refresh = useCallback(() => {
    setRefreshing(true);
    Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
      .then((pos) => {
        setState({ coords: readPos(pos), error: null, loading: false });
        setRefreshing(false);
      })
      .catch((err) => {
        setState((s) => ({ ...s, error: err?.message || 'Unable to get your location.', loading: false }));
        setRefreshing(false);
      });
  }, []);

  return <GeoContext.Provider value={{ ...state, refresh, refreshing }}>{children}</GeoContext.Provider>;
}

export function useGeo() {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error('useGeo must be used inside GeoProvider');
  return ctx;
}
