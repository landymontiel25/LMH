import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { ALL_LANDMARKS, ALL_LANDMARKS_BOUNDS, INTERESTS, getRegion } from '../data/regions';
import { SEARCHABLE_PLACES } from '../data/places';
import { useTrip } from '../lib/TripContext';
import { useGeo } from '../lib/GeoContext';
import { useZoomRadius, ZOOM_RADIUS_OPTIONS } from '../lib/useZoomRadius';
import { distanceMeters } from '../lib/geo';
import { useUnits, formatDistance } from '../lib/UnitsContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useMyPhotos } from '../lib/MyPhotosContext';
import { getLandmarkOverrides } from '../lib/landmarkOverrides';
import { getCustomLandmarks, deleteCustomLandmark } from '../lib/customLandmarks';
import { isAdmin } from '../lib/admins';
import CheckInButton from '../components/CheckInButton';
import LandmarkThumb from '../components/LandmarkThumb';

const CATEGORY_LABEL = Object.fromEntries(INTERESTS.map((i) => [i.id, i.label]));

// Only 4 combinations exist -- cache them instead of building a fresh
// L.divIcon every render for every marker. Reusing the same icon object also
// avoids feeding unnecessary churn into the marker cluster layer, which
// rebuilds (visibly, including any open popup) when it sees new icon refs.
const PIN_ICON_CACHE = new Map();

function pinIcon(checkedIn, addedToTrip) {
  const key = `${checkedIn}-${addedToTrip}`;
  if (!PIN_ICON_CACHE.has(key)) {
    PIN_ICON_CACHE.set(
      key,
      L.divIcon({
        className: '',
        html: `
          <div class="map-pin-wrap">
            <div class="map-pin ${checkedIn ? 'map-pin-checked-in' : ''}"></div>
            ${addedToTrip ? '<span class="map-pin-star">★</span>' : ''}
          </div>
        `,
        // The 20px pin sits at the wrap's top-left and rotates about its own
        // center (10,10); its square corner lands 10*sqrt(2) below that, so
        // the tip is at (10, 24) -- that's the point that must sit on the
        // coordinate, not the wrap's bottom edge.
        iconSize: [22, 26],
        iconAnchor: [10, 24],
        popupAnchor: [0, -28],
      })
    );
  }
  return PIN_ICON_CACHE.get(key);
}

// A marker's icon is one of the (checkedIn, addedToTrip) instances cached by
// pinIcon -- comparing identity against the two "checked in" cache entries is
// enough to tell without needing a second source of truth per marker.
function isCheckedInIcon(icon) {
  return icon === PIN_ICON_CACHE.get('true-false') || icon === PIN_ICON_CACHE.get('true-true');
}

function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const count = children.length;
  const size = count < 10 ? 34 : count < 30 ? 42 : 50;
  const allCheckedIn = count > 0 && children.every((m) => isCheckedInIcon(m.options.icon));
  return L.divIcon({
    className: '',
    html: `<div class="map-cluster ${allCheckedIn ? 'map-cluster-done' : ''}" style="width:${size}px;height:${size}px;">${count}</div>`,
    iconSize: [size, size],
  });
}

const userIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin-user"><div class="map-pin-user-pulse"></div></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Bright, unmistakable pin for the landmark you just came from.
const focusIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin-focus"></div>',
  // Same geometry as pinIcon: 26px pin centered at (13,13), tip at 13+13*sqrt(2).
  iconSize: [28, 32],
  iconAnchor: [13, 31],
  popupAnchor: [0, -36],
});

const TILE_LAYERS = {
  street: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
};

// Web Mercator meters-per-pixel-at-zoom-0-at-the-equator constant.
const EARTH_MPP_ZOOM0 = 156543.03392;
const METERS_PER_MILE = 1609.34;

// Zoom level such that `miles` is visible across the map's on-screen WIDTH
// (the dimension people actually eyeball for "how far is this"), independent
// of the container's aspect ratio.
function zoomForRadiusMiles(map, lat, miles) {
  const width = map.getSize().x;
  const metersPerPixel = (miles * METERS_PER_MILE) / width;
  return Math.log2((EARTH_MPP_ZOOM0 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel);
}

function InitialView({ loading, coords, bounds, regionBounds, focusPoint, radiusMiles }) {
  const map = useMap();
  const centered = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map]);

  useEffect(() => {
    if (centered.current) return;
    // Priority: a specific landmark ("See it on the Map") → the city you're
    // browsing → your GPS location → the whole collection.
    if (focusPoint) {
      centered.current = true;
      map.setView([focusPoint.lat, focusPoint.lng], 17);
    } else if (regionBounds) {
      centered.current = true;
      map.fitBounds(regionBounds, { padding: [40, 40] });
    } else if (coords) {
      centered.current = true;
      map.setView([coords.lat, coords.lng], zoomForRadiusMiles(map, coords.lat, radiusMiles));
    } else if (!loading) {
      centered.current = true;
      map.fitBounds(bounds, { padding: [30, 30] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, coords, regionBounds, focusPoint]);

  return null;
}

// Long-press on touch (and right-click on desktop) fires Leaflet's
// 'contextmenu' event -- no separate gesture library needed to let someone
// pin an exact spot that isn't one of the built-in landmarks.
function PinDropHandler({ onDrop }) {
  useMapEvents({
    contextmenu(e) {
      onDrop({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function LocateControl({ coords, radiusMiles }) {
  const map = useMap();
  return (
    <button
      type="button"
      className="map-locate-btn"
      disabled={!coords}
      title={coords ? 'Center on my location' : 'Locating…'}
      onClick={() => coords && map.flyTo([coords.lat, coords.lng], zoomForRadiusMiles(map, coords.lat, radiusMiles))}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" transform="rotate(45 12 12)" />
      </svg>
    </button>
  );
}

export default function MapExplore() {
  const { toggleLandmark, getRegionSelection, trip, mapFocus, mapFocusPoint, setMapFocusPoint } = useTrip();
  const { user, firebaseEnabled, claimedMap, checkingIn, checkIn } = useCheckIn();
  const { myPhotos } = useMyPhotos();
  const navigate = useNavigate();
  const { coords, error: geoError, loading: geoLoading } = useGeo();
  const { units } = useUnits();
  const mapRef = useRef(null);
  const [satellite] = useState(true);
  const [radiusMiles, setRadiusMiles] = useZoomRadius();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // A pin dropped by long-pressing an exact spot on the map -- lets you
  // pinpoint somewhere that isn't one of the built-in landmarks (e.g. a
  // specific building on a campus) and carry that exact location straight
  // into Add Landmark instead of having to re-find it there.
  const [pinDrop, setPinDrop] = useState(null);

  // Pin corrections saved by the old drag-to-fix mode (now removed) still
  // apply for everyone -- this just keeps displaying them at their
  // corrected spot rather than reverting to the source data's position.
  const [savedOverrides, setSavedOverrides] = useState({});
  useEffect(() => {
    getLandmarkOverrides().then(setSavedOverrides);
  }, []);

  // Custom (user-submitted) landmarks, added via the dedicated "Add
  // Landmark" page and merged onto the map alongside the built-in ones.
  const [customLandmarks, setCustomLandmarks] = useState([]);

  useEffect(() => {
    getCustomLandmarks().then(setCustomLandmarks);
  }, []);

  const removeCustomLandmark = async (docId) => {
    setCustomLandmarks((prev) => prev.filter((l) => l.docId !== docId));
    try {
      await deleteCustomLandmark(docId);
    } catch {
      // Firestore delete failed silently -- it'll reappear on next load,
      // which is an acceptable failure mode for a rare, low-stakes action.
    }
  };

  // The landmark you picked from search results — highlighted the same way
  // as "See it on the Map" from a landmark's detail page.
  const [searchFocus, setSearchFocus] = useState(null);

  // Capture the "fly to this landmark" request once (set when you view a
  // landmark), then clear the shared value so a later plain Map open doesn't
  // keep re-focusing it. The captured copy stays for this map view — it centers
  // the map AND drops a bright, named pin so you know exactly which one it is.
  const [focusLandmark] = useState(() => mapFocusPoint);
  useEffect(() => {
    if (mapFocusPoint) setMapFocusPoint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The city you actively opened this session (list / detail / itinerary). The
  // map frames it when present; on a cold launch it's null, so we fall back to
  // your GPS location instead of the last city you looked at.
  const regionBounds = useMemo(() => {
    const r = mapFocus ? getRegion(mapFocus) : null;
    if (!r?.landmarks?.length) return null;
    const lats = r.landmarks.map((l) => l.lat);
    const lngs = r.landmarks.map((l) => l.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [trip.activeRegion]);

  const handleRadiusChange = (e) => {
    const miles = Number(e.target.value);
    setRadiusMiles(miles);
    if (coords && mapRef.current) {
      mapRef.current.flyTo([coords.lat, coords.lng], zoomForRadiusMiles(mapRef.current, coords.lat, miles));
    }
  };

  const handleAdd = (landmark) => {
    toggleLandmark(landmark.id, landmark.regionId);
  };

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    const landmarkMatches = ALL_LANDMARKS.filter(
      (l) => l.name.toLowerCase().includes(term) || getRegion(l.regionId)?.name.toLowerCase().includes(term)
    ).map((l) => ({ id: `landmark-${l.id}`, name: l.name, sub: getRegion(l.regionId)?.name, lat: l.lat, lng: l.lng, zoom: 17 }));
    const placeMatches = SEARCHABLE_PLACES.filter((p) => p.name.toLowerCase().includes(term));
    return [...landmarkMatches, ...placeMatches].slice(0, 8);
  }, [searchTerm]);

  const selectSearchResult = (result) => {
    setSearchFocus(result);
    setSearchOpen(false);
    setSearchTerm('');
    mapRef.current?.flyTo([result.lat, result.lng], result.zoom);
  };

  const toggleSearch = () => {
    setSearchOpen((open) => !open);
    setSearchTerm('');
  };

  // A live, distance-sorted view of what's closest right now -- a faster
  // alternative to panning/zooming the map to see what's nearby. Only
  // meaningful with a real GPS fix, so it's just not offered without one.
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const nearbyList = useMemo(() => {
    if (!coords) return [];
    const all = [
      ...ALL_LANDMARKS.map((l) => ({ id: `landmark-${l.id}`, name: l.name, region: l.regionId, landmarkId: l.id, lat: l.lat, lng: l.lng })),
      ...customLandmarks.map((l) => ({ id: `custom-${l.docId}`, name: l.name, region: l.region, landmarkId: l.id, lat: l.lat, lng: l.lng })),
    ];
    return all
      .map((l) => ({ ...l, meters: distanceMeters(coords.lat, coords.lng, l.lat, l.lng) }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 12);
  }, [coords, customLandmarks]);

  // Build the markers once and reuse the same elements across re-renders. GPS
  // ticks update `coords` several times a minute; if the markers were rebuilt
  // inline each time, the whole cluster layer (and any open popup) would tear
  // down and flash. We only rebuild when something that actually changes a pin
  // or its popup changes — the itinerary selection, check-in state, or user —
  // NOT on location updates. CheckInButton reads live coords from context
  // itself, so the open popup still updates without rebuilding the cluster.
  // Plot EVERY landmark, in every city, all the time — clustering keeps the map
  // uncluttered (world view shows a few number bubbles; zoom into a city and
  // they break apart into individual pins). This lets you zoom out, spot a city,
  // and zoom in to its landmarks even when you're on another continent.
  const markers = useMemo(
    () =>
      ALL_LANDMARKS.map((l) => {
        const isSelected = getRegionSelection(l.regionId).includes(l.id);
        const region = getRegion(l.regionId);
        const isClaimed = !!claimedMap[l.id];
        const goToDetails = () => navigate(`/landmarks/${l.regionId}/${l.id}`);
        const savedPos = savedOverrides[`${l.regionId}/${l.id}`];
        const position = savedPos ? [savedPos.lat, savedPos.lng] : [l.lat, l.lng];
        return (
          <Marker key={l.id} position={position} icon={pinIcon(isClaimed, isSelected)}>
            <Popup>
              <div className="map-popup">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={goToDetails}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToDetails();
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Tap for details"
                >
                  <LandmarkThumb landmark={l} width={228} height={110} myPhoto={myPhotos[l.id]?.[0]} />
                </div>
                <h4 style={{ marginTop: 8 }}>{l.name}</h4>
                <p style={{ margin: '2px 0 8px', fontSize: '0.72rem', color: 'var(--color-parchment-dim)' }}>
                  {region?.name}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                  {l.categories.map((c) => (
                    <span key={c} className="tag">
                      {CATEGORY_LABEL[c]}
                    </span>
                  ))}
                  <span className={`tag ${l.free ? 'tag-free' : ''}`}>{l.free ? 'Free' : 'Ticketed'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${isSelected ? 'btn-success' : 'btn-primary'}`}
                    onClick={() => handleAdd(l)}
                  >
                    {isSelected ? '✓ Added to Itinerary' : 'Add to Itinerary'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={goToDetails}>
                    Details
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <CheckInButton
                    landmark={l}
                    user={user}
                    firebaseEnabled={firebaseEnabled}
                    claimedMap={claimedMap}
                    checkingIn={checkingIn}
                    onCheckIn={checkIn}
                    className="btn-block"
                  />
                </div>
              </div>
            </Popup>
          </Marker>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip.byRegion, claimedMap, checkingIn, user, firebaseEnabled, savedOverrides]
  );

  const customMarkers = useMemo(
    () =>
      customLandmarks.map((l) => {
        const region = getRegion(l.region);
        // Needs both regionId (used by claimCheckIn/leaderboard) and region
        // (used by submitReview's review doc) -- omitting the latter used to
        // write `region: undefined` into the review, which the Firestore SDK
        // rejects client-side ("Unsupported field value: undefined").
        const syntheticLandmark = { id: l.id, name: l.name, regionId: l.region, region: l.region, lat: l.lat, lng: l.lng };
        const isClaimed = !!claimedMap[l.id];
        return (
          <Marker key={l.docId} position={[l.lat, l.lng]} icon={pinIcon(isClaimed, false)}>
            <Popup>
              <div className="map-popup">
                <h4 style={{ marginTop: 0 }}>{l.name}</h4>
                <p style={{ margin: '2px 0 8px', fontSize: '0.72rem', color: 'var(--color-parchment-dim)' }}>
                  {region?.name || 'Custom pin'}
                </p>
                <CheckInButton
                  landmark={syntheticLandmark}
                  user={user}
                  firebaseEnabled={firebaseEnabled}
                  claimedMap={claimedMap}
                  checkingIn={checkingIn}
                  onCheckIn={checkIn}
                  className="btn-block"
                />
                {l.summary && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block"
                    style={{ marginTop: 8 }}
                    onClick={() => navigate(`/landmarks/${l.region}/${l.id}`)}
                  >
                    {'ℹ️'} Info
                  </button>
                )}
                {user && (l.createdBy === user.uid || isAdmin(user.email)) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block"
                    style={{ marginTop: 8 }}
                    onClick={() => removeCustomLandmark(l.docId)}
                  >
                    {'\u{1F5D1}'} Remove Pin
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      }),
    [customLandmarks, claimedMap, checkingIn, user, firebaseEnabled, checkIn, navigate]
  );

  return (
    <div className="map-fullscreen">
      {geoLoading && (
        <div className="map-loading-overlay">
          <span className="map-loading-pulse" />
          Finding your location…
        </div>
      )}

      <MapContainer
          ref={mapRef}
          center={[20, 0]}
          zoom={2}
          zoomSnap={0.25}
          zoomDelta={0.25}
          zoomControl={false}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <InitialView
            loading={geoLoading}
            coords={coords}
            bounds={ALL_LANDMARKS_BOUNDS}
            regionBounds={regionBounds}
            focusPoint={focusLandmark}
            radiusMiles={radiusMiles}
          />
          <LocateControl coords={coords} radiusMiles={radiusMiles} />
          <PinDropHandler onDrop={setPinDrop} />
          <TileLayer
            key={satellite ? 'satellite' : 'street'}
            attribution={TILE_LAYERS[satellite ? 'satellite' : 'street'].attribution}
            url={TILE_LAYERS[satellite ? 'satellite' : 'street'].url}
          />
          {/* Transparent labels overlay on top of the satellite imagery: country
              names when zoomed out, cities mid-zoom, neighborhoods/streets up
              close — so you can orient without leaving the satellite view. */}
          {satellite && (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution="Place labels &copy; Esri"
              zIndex={650}
            />
          )}
          {coords && (
            <Marker position={[coords.lat, coords.lng]} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {focusLandmark && (
            <Marker position={[focusLandmark.lat, focusLandmark.lng]} icon={focusIcon} zIndexOffset={1000}>
              {focusLandmark.name && (
                <Tooltip permanent direction="top" offset={[0, -34]} className="focus-tooltip">
                  {focusLandmark.name}
                </Tooltip>
              )}
            </Marker>
          )}
          {searchFocus && (
            <Marker position={[searchFocus.lat, searchFocus.lng]} icon={focusIcon} zIndexOffset={1000}>
              <Tooltip permanent direction="top" offset={[0, -34]} className="focus-tooltip">
                {searchFocus.name}
              </Tooltip>
            </Marker>
          )}
          {pinDrop && (
            <Marker
              position={[pinDrop.lat, pinDrop.lng]}
              icon={focusIcon}
              zIndexOffset={1000}
              eventHandlers={{
                add: (e) => e.target.openPopup(),
                popupclose: () => setPinDrop(null),
              }}
            >
              <Popup>
                <div className="map-popup">
                  <h4 style={{ marginTop: 0 }}>Add a landmark here?</h4>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate('/add-landmark', { state: pinDrop })}
                    >
                      {'\u{2795}'} Add Landmark
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPinDrop(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={55}
            spiderfyOnMaxZoom
            iconCreateFunction={clusterIcon}
          >
            {markers}
            {customMarkers}
          </MarkerClusterGroup>
        </MapContainer>

      <button type="button" className="map-search-btn" title="Search landmarks" onClick={toggleSearch}>
        {searchOpen ? '\u{2715}' : '\u{1F50D}'}
      </button>
      <button
        type="button"
        className="map-search-btn map-add-btn"
        style={{ top: 'calc(var(--header-h) + 64px)' }}
        title="Add a landmark — long-press the map to pin an exact spot"
        onClick={() => {
          // Wherever you're currently looking at -- the dropped pin if you
          // placed one, otherwise the map's current center -- never your
          // GPS location, which would yank you away from what you were
          // just looking at.
          const center = mapRef.current?.getCenter();
          const at = pinDrop || (center ? { lat: center.lat, lng: center.lng } : null);
          navigate('/add-landmark', at ? { state: at } : undefined);
        }}
      >
        {'\u{2795}'}
      </button>
      {coords && (
        <button
          type="button"
          className="map-search-btn"
          style={{ top: 'calc(var(--header-h) + 128px)' }}
          title="What's nearby right now"
          onClick={() => setNearbyOpen((o) => !o)}
        >
          {nearbyOpen ? '\u{2715}' : '\u{1F4E1}'}
        </button>
      )}
      {nearbyOpen && (
        <div className="map-search-panel">
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.9rem' }}>{'\u{1F4E1}'} Nearby Now</p>
          <div className="map-search-results">
            {nearbyList.length === 0 && <div className="map-search-empty">Nothing nearby yet.</div>}
            {nearbyList.map((l) => (
              <button
                type="button"
                key={l.id}
                className="map-search-result"
                onClick={() => {
                  setNearbyOpen(false);
                  navigate(`/landmarks/${l.region}/${l.landmarkId}`);
                }}
              >
                <span className="map-search-result-name">{l.name}</span>
                <span className="map-search-result-city">{formatDistance(l.meters, units)} away</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {searchOpen && (
        <div className="map-search-panel">
          <input
            type="text"
            autoFocus
            className="map-search-input"
            placeholder={'\u{1F50D} Search landmarks, states, countries…'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm.trim() && (
            <div className="map-search-results">
              {searchResults.length === 0 && (
                <div className="map-search-empty">Nothing matches "{searchTerm}".</div>
              )}
              {searchResults.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="map-search-result"
                  onClick={() => selectSearchResult(r)}
                >
                  <span className="map-search-result-name">{r.name}</span>
                  <span className="map-search-result-city">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="map-fab-bar">
        <select className="radius-select" value={radiusMiles} onChange={handleRadiusChange} title="Zoom radius">
          {ZOOM_RADIUS_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} mi
            </option>
          ))}
        </select>
      </div>

      {geoError && <p className="tag tag-error map-error-toast">Location unavailable — {geoError}</p>}
    </div>
  );
}
