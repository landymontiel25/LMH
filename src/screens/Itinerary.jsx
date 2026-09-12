import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTrip } from '../lib/TripContext';
import { useGeo } from '../lib/GeoContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useMyPhotos } from '../lib/MyPhotosContext';
import CheckInButton from '../components/CheckInButton';
import LandmarkThumb from '../components/LandmarkThumb';
import TripRecapCard from '../components/TripRecapCard';
import ThemedChallenge from '../components/ThemedChallenge';
import OfflineDownloadButton from '../components/OfflineDownloadButton';
import { getRegion } from '../data/regions';
import { geocodeLocation } from '../lib/geocode';
import { distanceMeters } from '../lib/geo';
import { buildNearestNeighborRoute, enhanceRouteWithDrivingTimes, mapsDeepLink } from '../lib/routing';

const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

const ROUTE_BLUE = '#2b7fff';

// Satellite basemap (matches the Explore map's default look).
const SAT_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
};

const startIcon = L.divIcon({
  className: '',
  html: '<div class="route-map-start">START</div>',
  iconSize: [46, 22],
  iconAnchor: [23, 11],
});

function numberedIcon(n) {
  return L.divIcon({
    className: '',
    html: `<div class="route-map-num">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

// Fit the map to show the whole route (origin + every stop) once it's ready.
function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map]);
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

function ItineraryMap({ origin, stops }) {
  // Only put the START point on the map when it's actually near the city you're
  // viewing (same metro). If you're 1,000 miles away, including it would draw a
  // long line across states and zoom the map out to the whole coast — so we drop
  // it and just show the city's stops.
  const nearestStopKm =
    origin && stops.length
      ? Math.min(...stops.map((s) => distanceMeters(origin.lat, origin.lng, s.lat, s.lng))) / 1000
      : Infinity;
  const showOrigin = !!origin && nearestStopKm <= 80; // ~50 miles

  const linePoints = [
    ...(showOrigin ? [[origin.lat, origin.lng]] : []),
    ...stops.map((s) => [s.lat, s.lng]),
  ];

  return (
    <div className="itinerary-map">
      <MapContainer center={linePoints[0] || [25.77, -80.19]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <FitRoute points={linePoints} />
        <TileLayer url={SAT_TILE.url} attribution={SAT_TILE.attribution} />

        {/* White casing under the blue line for contrast on satellite imagery */}
        {linePoints.length > 1 && (
          <>
            <Polyline positions={linePoints} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.55 }} />
            <Polyline positions={linePoints} pathOptions={{ color: ROUTE_BLUE, weight: 4, opacity: 0.95 }} />
          </>
        )}

        {showOrigin && (
          <Marker position={[origin.lat, origin.lng]} icon={startIcon}>
            <Popup>Your starting point</Popup>
          </Marker>
        )}

        {stops.map((s, idx) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(idx + 1)}>
            <Popup>
              <strong>
                {idx + 1}. {s.name}
              </strong>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// How far you need to actually move before we re-route off your live GPS.
// watchPosition fires on every tiny jitter; without this, each tick would
// re-trigger the OSRM driving-time lookups for no real change in the route.
const AUTO_ORIGIN_REFRESH_METERS = 150;

export default function Itinerary() {
  const { trip, toggleLandmark, setRegionSelection, getRegionSelection, regionsWithItineraries, updateTrip, setMapFocus } = useTrip();
  const { coords } = useGeo();
  const { user, firebaseEnabled, claimedMap, checkingIn, checkIn } = useCheckIn();
  const { myPhotos } = useMyPhotos();
  const navigate = useNavigate();

  // One itinerary per city. Overview lists them; opening one shows its route.
  const myRegions = regionsWithItineraries();
  const [openRegion, setOpenRegion] = useState(null);
  const openReg = openRegion && myRegions.includes(openRegion) ? openRegion : null;
  const region = getRegion(openReg);

  // Opening a city's itinerary makes it the active city, so tapping Map lands
  // on this city (not on whatever you looked at last).
  useEffect(() => {
    if (openReg) {
      updateTrip({ activeRegion: openReg });
      setMapFocus(openReg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReg]);

  const [origin, setOrigin] = useState(null);
  const [geocoding, setGeocoding] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'map'
  const [pendingRemove, setPendingRemove] = useState(null); // stop awaiting delete confirmation
  const [showRecap, setShowRecap] = useState(false);
  const autoOriginRef = useRef(null);

  const confirmRemove = () => {
    if (pendingRemove && region) toggleLandmark(pendingRemove.id, region.id);
    setPendingRemove(null);
  };

  const selectedLandmarks = useMemo(() => {
    if (!region) return [];
    const ids = trip.byRegion[region.id] || [];
    return region.landmarks.filter((l) => ids.includes(l.id));
  }, [region, trip.byRegion]);

  // Priority for the route's starting point: an explicit pin (autocomplete
  // selection or "Use My Current Location") > a typed address to geocode >
  // your live GPS, refreshed only once you've actually moved > the region's
  // center as a last resort before any of that is available. No starting
  // location is required — landmarks you've added always show a route.
  useEffect(() => {
    let cancelled = false;

    if (!region) {
      setGeocoding(false);
      return;
    }

    if (trip.startingCoords) {
      setOrigin(trip.startingCoords);
      setGeocoding(false);
      return;
    }

    if (trip.startingLocation) {
      setGeocoding(true);
      geocodeLocation(trip.startingLocation, region).then((geocoded) => {
        if (!cancelled) {
          setOrigin(geocoded || region.center);
          setGeocoding(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const fallback = coords || region.center;
    const last = autoOriginRef.current;
    const moved = !last || distanceMeters(last.lat, last.lng, fallback.lat, fallback.lng) > AUTO_ORIGIN_REFRESH_METERS;
    if (moved) {
      autoOriginRef.current = fallback;
      setOrigin(fallback);
    }
    setGeocoding(false);
  }, [region, trip.startingLocation, trip.startingCoords, coords]);

  // Single ordering: a nearest-neighbor route starting from your LIVE location
  // (falling back to the saved start point). Stop #1 is the closest landmark to
  // you, and each next stop is the closest to the previous — so it's "nearest
  // to me first" AND an efficient route with no backtracking, in one.
  // Quantize to ~100m so the order/route only recomputes when you actually move,
  // not on every GPS jitter (which made the screen flicker and re-sort).
  const liveOrigin = coords || origin;
  const originKey = liveOrigin ? `${liveOrigin.lat.toFixed(3)},${liveOrigin.lng.toFixed(3)}` : 'none';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const routeOrigin = useMemo(() => liveOrigin, [originKey]);

  const route = useMemo(() => {
    if (!routeOrigin || !selectedLandmarks.length) return [];
    return buildNearestNeighborRoute(routeOrigin, selectedLandmarks);
  }, [routeOrigin, selectedLandmarks]);

  const [drivingRoute, setDrivingRoute] = useState([]);
  const [refiningTimes, setRefiningTimes] = useState(false);

  useEffect(() => {
    if (!routeOrigin || !route.length) {
      setDrivingRoute([]);
      return;
    }
    let cancelled = false;
    setRefiningTimes(true);
    enhanceRouteWithDrivingTimes(routeOrigin, route).then((enhanced) => {
      if (!cancelled) {
        setDrivingRoute(enhanced);
        setRefiningTimes(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routeOrigin, route]);

  const displayRoute = drivingRoute.length === route.length ? drivingRoute : route;

  const totals = useMemo(() => {
    // The first leg is from your location to stop #1. When you're far from the
    // city (planning ahead), skip that cross-country hop so it doesn't inflate
    // the city's total time.
    const travel = displayRoute.reduce((s, r, i) => {
      if (i === 0 && (r.distanceFromPrevMeters || 0) > 80000) return s;
      return s + (r.travelMinutesFromPrev || 0);
    }, 0);
    const there = displayRoute.reduce((s, r) => s + r.typicalMinutes, 0);
    return { travel, there, total: travel + there };
  }, [displayRoute]);

  // How many of this city's planned landmarks you've already checked in at.
  const visitedCount = selectedLandmarks.filter((l) => claimedMap[l.id]).length;

  // No cities planned yet.
  if (myRegions.length === 0) {
    return (
      <div className="empty-state">
        <p>No itineraries yet. Add landmarks in any city to start one.</p>
        <button className="btn btn-primary" onClick={() => navigate('/landmarks')}>
          Choose Landmarks
        </button>
      </div>
    );
  }

  // Overview: your cities. Tap one to open its route.
  if (!openReg) {
    return (
      <div>
        <h1 className="screen-title">
          <span>{'\u{1F5FA}\u{FE0F}'}</span> Your Itineraries
        </h1>
        <p className="screen-subtitle">
          {myRegions.length} {myRegions.length === 1 ? 'city' : 'cities'} planned — tap one to see its route.
        </p>
        {myRegions.map((rid) => {
          const r = getRegion(rid);
          const count = (trip.byRegion[rid] || []).length;
          return (
            <button key={rid} type="button" className="card itin-city-card" onClick={() => setOpenRegion(rid)}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0 }}>{r?.name}</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--color-parchment-dim)', fontSize: '0.85rem' }}>
                  {count} landmark{count !== 1 ? 's' : ''}
                </p>
              </div>
              <span className="itin-city-arrow">{'→'}</span>
            </button>
          );
        })}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => navigate('/landmarks')}>
          {'➕'} Add another city
        </button>
      </div>
    );
  }

  if (geocoding) {
    return (
      <div className="empty-state">
        <p>{'\u{1F9ED}'} Mapping your {region.name} route…</p>
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setOpenRegion(null)}>
        {'←'} My Itineraries
      </button>
      <h1 className="screen-title">
        <span>{'\u{1F5FA}\u{FE0F}'}</span> {region.name}
      </h1>
      <p className="screen-subtitle">
        Nearest first from {coords ? 'your current location' : trip.startingLocation || 'your starting point'} ·{' '}
        {displayRoute.length} stops
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="tag">
          {'\u{1F4CD}'} {selectedLandmarks.length} landmark{selectedLandmarks.length !== 1 ? 's' : ''} in {region.name}
        </span>
        <span className="tag">
          {'\u{2705}'} {visitedCount} of {selectedLandmarks.length} visited
        </span>
        {visitedCount > 0 && (
          <button type="button" className="btn btn-ghost btn-tight" onClick={() => setShowRecap(true)}>
            {'\u{1F3AC}'} Trip Recap
          </button>
        )}
      </div>

      <ThemedChallenge
        regionId={region.id}
        claimedMap={claimedMap}
        onAddAll={(landmarks) => {
          const current = getRegionSelection(region.id);
          const merged = [...new Set([...current, ...landmarks.map((l) => l.id)])];
          setRegionSelection(region.id, merged);
        }}
      />
      <OfflineDownloadButton region={region} />

      {showRecap && (
        <TripRecapCard
          regionName={region.name}
          visitedLandmarks={selectedLandmarks.filter((l) => claimedMap[l.id])}
          onClose={() => setShowRecap(false)}
        />
      )}

      <div className="tabs" style={{ maxWidth: 320 }}>
        <button
          type="button"
          className={`tab-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          {'\u{1F5D2}\u{FE0F}'} List
        </button>
        <button
          type="button"
          className={`tab-btn ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >
          {'\u{1F5FA}\u{FE0F}'} Map
        </button>
      </div>

      {view === 'map' && <ItineraryMap origin={routeOrigin} stops={displayRoute} />}

      <div style={{ display: view === 'list' ? 'block' : 'none' }}>
        {displayRoute.map((stop, idx) => (
          <div key={stop.id}>
            {idx === 0
              ? stop.distanceFromPrevMeters <= 80000 && (
                  <div className="route-travel">
                    {'\u{1F4CD}'} {fmtDist(stop.distanceFromPrevMeters)} from you
                  </div>
                )
              : (
                <div className="route-travel">
                  {'\u{1F6B6}'} {fmtDist(stop.distanceFromPrevMeters)} to next stop
                </div>
              )}
            <div className="route-step">
              <div className="route-num">{idx + 1}</div>
              <div className="card" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <LandmarkThumb landmark={stop} size={44} myPhoto={myPhotos[stop.id]?.[0]} />
                    <h4 style={{ margin: 0, color: 'var(--color-parchment)' }}>{stop.name}</h4>
                  </div>
                  <button
                    type="button"
                    className="btn-icon-trash"
                    title="Remove from itinerary"
                    onClick={() => setPendingRemove(stop)}
                  >
                    {'\u{1F5D1}\u{FE0F}'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className={`tag ${stop.free ? 'tag-free' : ''}`}>
                    {stop.free ? 'Free to Visit' : 'Ticketed'}
                  </span>
                  <span className="tag">{'\u{23F1}\u{FE0F}'} ~{stop.typicalMinutes} min there</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={mapsDeepLink(stop.name, stop.lat, stop.lng)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Directions
                  </a>
                  {stop.free ? (
                    <button className="btn btn-sm" disabled style={{ borderColor: 'var(--color-green)', color: '#bfe0c8' }}>
                      Free to Visit
                    </button>
                  ) : (
                    <a className="btn btn-primary btn-sm" href={stop.bookingUrl || '#'} target="_blank" rel="noreferrer">
                      Book Now
                    </a>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/landmarks/${region.id}/${stop.id}`)}>
                    Details
                  </button>
                  <CheckInButton
                    landmark={stop}
                    user={user}
                    firebaseEnabled={firebaseEnabled}
                    claimedMap={claimedMap}
                    checkingIn={checkingIn}
                    onCheckIn={checkIn}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/')}>
        {'\u{1F3AF}'} Start Checking In on the Map
      </button>

      {pendingRemove && (
        <div className="modal-backdrop" onClick={() => setPendingRemove(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{'\u{1F5D1}\u{FE0F}'} Remove this stop?</h3>
            <p className="screen-subtitle" style={{ marginTop: 0 }}>
              Take <strong>{pendingRemove.name}</strong> off your {region?.name} itinerary? You can always add it back later.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost btn-block" onClick={() => setPendingRemove(null)}>
                Keep it
              </button>
              <button className="btn btn-danger btn-block" onClick={confirmRemove}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
