import { useEffect, useRef, useState } from 'react';
import { useTrip } from './TripContext';
import { useGeo } from './GeoContext';
import { nearestRegionId } from './geo';
import { reverseAddress } from './geocode';

export const CURRENT_LOCATION_LABEL = 'Your Current Location';

// "Use My Current Location" for a trip's starting point (TripPlannerCard,
// TripSetup). Applies the GPS fix instantly under a placeholder label, then
// swaps in the real street address / building once the reverse lookup
// lands -- unless you've typed or picked something else in the meantime.
export function useGpsStartLocation() {
  const { trip, updateTrip } = useTrip();
  const { coords, error: geoError, refreshing: geoRefreshing, refresh: refreshGeo } = useGeo();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  const [gpsAddress, setGpsAddress] = useState(null);
  const tokenRef = useRef(0);
  const tripRef = useRef(trip);
  tripRef.current = trip;

  const applyCoords = ({ lat, lng }) => {
    const token = ++tokenRef.current;
    setGpsAddress(null);
    updateTrip({
      startingLocation: CURRENT_LOCATION_LABEL,
      startingCoords: { lat, lng },
      activeRegion: nearestRegionId(lat, lng),
    });
    reverseAddress(lat, lng).then((address) => {
      if (!address || token !== tokenRef.current) return;
      if (tripRef.current.startingLocation !== CURRENT_LOCATION_LABEL) return;
      setGpsAddress(address);
      updateTrip({ startingLocation: address });
    });
  };

  const useCurrentLocation = () => {
    if (coords) {
      applyCoords(coords);
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocateError('Geolocation is not supported on this device.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    refreshGeo();
  };

  // GeoContext's refresh() has no per-call callback; finish once it settles.
  useEffect(() => {
    if (!locating || geoRefreshing) return;
    if (coords) applyCoords(coords);
    else if (geoError) setLocateError(geoError);
    setLocating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locating, geoRefreshing]);

  const usingGps =
    trip.startingLocation === CURRENT_LOCATION_LABEL || (!!gpsAddress && trip.startingLocation === gpsAddress);

  return { useCurrentLocation, locating, locateError, usingGps };
}
