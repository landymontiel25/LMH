import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'lh-units';

function getInitialUnits() {
  return localStorage.getItem(STORAGE_KEY) === 'imperial' ? 'imperial' : 'metric';
}

// Every distance shown in the app (Nearby Now, itinerary stops, the
// distance tag on a landmark card) formats through this one function, so
// switching units on Settings updates all of them at once.
export function formatDistance(meters, units) {
  if (units === 'imperial') {
    const feet = meters * 3.28084;
    return feet < 1000 ? `${Math.round(feet)} ft` : `${(meters / 1609.34).toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const UnitsContext = createContext(null);

export function UnitsProvider({ children }) {
  const [units, setUnits] = useState(getInitialUnits);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, units);
  }, [units]);

  const toggleUnits = () => setUnits((u) => (u === 'metric' ? 'imperial' : 'metric'));

  return <UnitsContext.Provider value={{ units, toggleUnits }}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used inside UnitsProvider');
  return ctx;
}
