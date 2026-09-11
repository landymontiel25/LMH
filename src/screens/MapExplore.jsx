import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { ALL_LANDMARKS, ALL_LANDMARKS_BOUNDS, REGIONS, INTERESTS, getRegion } from '../data/regions';
import { SEARCHABLE_PLACES } from '../data/places';
import { useTrip } from '../lib/TripContext';
import { useGeo } from '../lib/GeoContext';
import { useZoomRadius, ZOOM_RADIUS_OPTIONS } from '../lib/useZoomRadius';
import { useCheckIn } from '../lib/useCheckIn';
import { getLandmarkOverrides, saveLandmarkPosition } from '../lib/landmarkOverrides';
import { getCustomLandmarks, addCustomLandmark, deleteCustomLandmark } from '../lib/customLandmarks';
import { distanceMeters } from '../lib/geo';
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

function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 30 ? 42 : 50;
  return L.divIcon({
    className: '',
    html: `<div class="map-cluster" style="width:${size}px;height:${size}px;">${count}</div>`,
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

// While Add Pin mode is on, tapping empty map space (not an existing marker
// -- those stop the click from reaching the map) picks that spot.
function AddPinOnClick({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng);
    },
  });
  return null;
}

// Remove-pins mode: drag a rectangle (like selecting Finder icons) to pick
// which custom pins to delete. Map panning is disabled for the duration of
// the drag so it draws a box instead of moving the map.
function BoxSelect({ enabled, customLandmarks, onDrag, onFinish }) {
  const map = useMap();
  const startRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!enabled && draggingRef.current) {
      draggingRef.current = false;
      map.dragging.enable();
    }
  }, [enabled, map]);

  useMapEvents({
    mousedown(e) {
      if (!enabled) return;
      map.dragging.disable();
      draggingRef.current = true;
      startRef.current = e.latlng;
      onDrag(L.latLngBounds(e.latlng, e.latlng));
    },
    mousemove(e) {
      if (!draggingRef.current) return;
      onDrag(L.latLngBounds(startRef.current, e.latlng));
    },
    mouseup(e) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      map.dragging.enable();
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      const ids = customLandmarks.filter((l) => bounds.contains([l.lat, l.lng])).map((l) => l.docId);
      onFinish(ids, bounds);
    },
  });
  return null;
}

function nearestRegionId(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const r of REGIONS) {
    const d = distanceMeters(lat, lng, r.center.lat, r.center.lng);
    if (d < bestDist) {
      bestDist = d;
      best = r.id;
    }
  }
  return best;
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
  const navigate = useNavigate();
  const { coords, error: geoError, loading: geoLoading } = useGeo();
  const mapRef = useRef(null);
  const [satellite] = useState(true);
  const [radiusMiles, setRadiusMiles] = useZoomRadius();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Drag-to-fix mode: a pin in the wrong spot gets dragged to where it
  // actually is, right on the map -- no geocoding, no data lookups, just
  // moving it to match what you can see. Clustering is switched off while
  // this is on so every pin is a direct drag target.
  const [fixMode, setFixMode] = useState(false);
  const [movedPins, setMovedPins] = useState({});
  const [savedOverrides, setSavedOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // Corrected pin positions are shared (Firestore), so they load once and
  // apply for every visitor, not just whoever dragged the pin.
  useEffect(() => {
    getLandmarkOverrides().then(setSavedOverrides);
  }, []);

  // Add Pin mode: tap empty map space to place a brand-new landmark (not a
  // correction to an existing one) -- for the real thing not yet in the
  // built-in catalog, like a dorm hall. Saved to Firestore, so it's there
  // for every visitor. Check-ins on it reuse the normal flow untouched.
  const [addMode, setAddMode] = useState(false);
  const [customLandmarks, setCustomLandmarks] = useState([]);
  const [pendingPin, setPendingPin] = useState(null); // {lat, lng} | null
  const [pendingName, setPendingName] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    getCustomLandmarks().then(setCustomLandmarks);
  }, []);

  const savePendingPin = async () => {
    const name = pendingName.trim();
    if (!name || !pendingPin || addSaving) return;
    setAddSaving(true);
    setAddError('');
    try {
      const created = await addCustomLandmark({
        region: nearestRegionId(pendingPin.lat, pendingPin.lng),
        name,
        lat: pendingPin.lat,
        lng: pendingPin.lng,
        userId: user?.uid,
      });
      setCustomLandmarks((prev) => [...prev, created]);
      setPendingPin(null);
      setPendingName('');
    } catch (err) {
      setAddError(err.message || 'Could not save — try again.');
    } finally {
      setAddSaving(false);
    }
  };

  const removeCustomLandmark = async (docId) => {
    setCustomLandmarks((prev) => prev.filter((l) => l.docId !== docId));
    try {
      await deleteCustomLandmark(docId);
    } catch {
      // Firestore delete failed silently -- it'll reappear on next load,
      // which is an acceptable failure mode for a rare, low-stakes action.
    }
  };

  // Remove-pins mode: drag a box around custom pins (like selecting Finder
  // icons) to delete several at once. Only ever touches custom_landmarks --
  // built-in landmarks live in source code, not a database, so there's
  // nothing here to delete them with.
  const [removeMode, setRemoveMode] = useState(false);
  const [selectionBounds, setSelectionBounds] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [removing, setRemoving] = useState(false);

  const clearSelection = () => {
    setSelectionBounds(null);
    setSelectedDocIds([]);
  };

  const confirmRemoveSelected = async () => {
    setRemoving(true);
    const ids = selectedDocIds;
    setCustomLandmarks((prev) => prev.filter((l) => !ids.includes(l.docId)));
    clearSelection();
    try {
      await Promise.all(ids.map((docId) => deleteCustomLandmark(docId)));
    } catch {
      // best-effort, same as the single-pin remove above
    } finally {
      setRemoving(false);
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
  const handlePinDragEnd = (l) => (e) => {
    const { lat, lng } = e.target.getLatLng();
    setMovedPins((prev) => ({ ...prev, [l.id]: { region: l.regionId, id: l.id, name: l.name, lat, lng } }));
  };

  const markers = useMemo(
    () =>
      ALL_LANDMARKS.map((l) => {
        const isSelected = getRegionSelection(l.regionId).includes(l.id);
        const region = getRegion(l.regionId);
        const isClaimed = !!claimedMap[l.id];
        const goToDetails = () => navigate(`/landmarks/${l.regionId}/${l.id}`);
        const moved = movedPins[l.id];
        const savedPos = savedOverrides[`${l.regionId}/${l.id}`];
        const position = moved ? [moved.lat, moved.lng] : savedPos ? [savedPos.lat, savedPos.lng] : [l.lat, l.lng];
        return (
          <Marker
            key={l.id}
            position={position}
            icon={fixMode ? pinIcon(!!moved, false) : pinIcon(isClaimed, isSelected)}
            draggable={fixMode}
            eventHandlers={fixMode ? { dragend: handlePinDragEnd(l) } : undefined}
          >
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
                  <LandmarkThumb landmark={l} width={228} height={110} />
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
    [trip.byRegion, claimedMap, checkingIn, user, firebaseEnabled, fixMode, movedPins, savedOverrides]
  );

  const customMarkers = useMemo(
    () =>
      customLandmarks.map((l) => {
        const region = getRegion(l.region);
        const syntheticLandmark = { id: l.id, name: l.name, regionId: l.region };
        const isClaimed = !!claimedMap[l.id];
        const isSelected = selectedDocIds.includes(l.docId);
        return (
          <Marker key={l.docId} position={[l.lat, l.lng]} icon={pinIcon(isClaimed || isSelected, false)}>
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => removeCustomLandmark(l.docId)}
                >
                  {'\u{1F5D1}'} Remove Pin
                </button>
              </div>
            </Popup>
          </Marker>
        );
      }),
    [customLandmarks, claimedMap, checkingIn, user, firebaseEnabled, checkIn, selectedDocIds]
  );

  const submitMovedPins = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const entries = Object.values(movedPins);
      await Promise.all(entries.map((p) => saveLandmarkPosition({ ...p, userId: user?.uid })));
      setSavedOverrides((prev) => {
        const next = { ...prev };
        entries.forEach((p) => {
          next[`${p.region}/${p.id}`] = { lat: p.lat, lng: p.lng };
        });
        return next;
      });
      setMovedPins({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setSaveError(err.message || 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

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
          <AddPinOnClick enabled={addMode && !pendingPin} onPick={setPendingPin} />
          {pendingPin && (
            <Marker position={[pendingPin.lat, pendingPin.lng]} icon={focusIcon} zIndexOffset={1000} />
          )}
          <BoxSelect
            enabled={removeMode}
            customLandmarks={customLandmarks}
            onDrag={setSelectionBounds}
            onFinish={(ids, bounds) => {
              setSelectedDocIds(ids);
              setSelectionBounds(bounds);
            }}
          />
          {selectionBounds && (
            <Rectangle bounds={selectionBounds} pathOptions={{ color: '#b3503f', weight: 2, fillOpacity: 0.12 }} />
          )}
          {fixMode ? (
            <>
              {markers}
              {customMarkers}
            </>
          ) : (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={55}
              spiderfyOnMaxZoom
              iconCreateFunction={clusterIcon}
            >
              {markers}
              {customMarkers}
            </MarkerClusterGroup>
          )}
        </MapContainer>

      <button type="button" className="map-search-btn" title="Search landmarks" onClick={toggleSearch}>
        {searchOpen ? '\u{2715}' : '\u{1F50D}'}
      </button>
      <button
        type="button"
        className="map-search-btn"
        style={{ top: 'calc(var(--header-h) + 64px)' }}
        title={fixMode ? 'Done fixing pins' : 'Fix pin locations — drag any pin to where it actually is'}
        onClick={() => {
          setFixMode((f) => !f);
          setAddMode(false);
          setRemoveMode(false);
          clearSelection();
        }}
      >
        {fixMode ? '\u{2715}' : '\u{1F4CD}'}
      </button>
      <button
        type="button"
        className="map-search-btn"
        style={{ top: 'calc(var(--header-h) + 116px)' }}
        title={addMode ? 'Done adding pins' : 'Add a new pin — tap the map where it belongs'}
        onClick={() => {
          setAddMode((a) => !a);
          setFixMode(false);
          setPendingPin(null);
          setRemoveMode(false);
          clearSelection();
        }}
      >
        {addMode ? '\u{2715}' : '\u{2795}'}
      </button>
      <button
        type="button"
        className="map-search-btn"
        style={{ top: 'calc(var(--header-h) + 168px)' }}
        title={removeMode ? 'Done removing pins' : 'Remove pins — drag a box around the ones to delete'}
        onClick={() => {
          setRemoveMode((r) => !r);
          setFixMode(false);
          setAddMode(false);
          setPendingPin(null);
          clearSelection();
        }}
      >
        {removeMode ? '\u{2715}' : '\u{1F5D1}'}
      </button>
      {addMode && !pendingPin && (
        <div className="map-search-panel" style={{ top: 'auto', bottom: 'calc(var(--nav-h) + 16px)', maxWidth: 320 }}>
          <div className="card" style={{ padding: 12 }}>
            <strong>Add Pin</strong>
            <p className="screen-subtitle" style={{ margin: '4px 0 0' }}>
              Tap anywhere on the map where a landmark should be.
            </p>
          </div>
        </div>
      )}
      {pendingPin && (
        <div className="map-search-panel" style={{ top: 'auto', bottom: 'calc(var(--nav-h) + 16px)', maxWidth: 320 }}>
          <div className="card" style={{ padding: 12 }}>
            <strong>Name This Pin</strong>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Farley Hall"
              value={pendingName}
              maxLength={80}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') savePendingPin();
              }}
              style={{ width: '100%', marginTop: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                disabled={!pendingName.trim() || addSaving || !user}
                onClick={savePendingPin}
              >
                {addSaving ? 'Saving…' : 'Save Pin'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setPendingPin(null);
                  setPendingName('');
                }}
              >
                Cancel
              </button>
            </div>
            {!user && (
              <p className="tag tag-error" style={{ display: 'block', marginTop: 8, marginBottom: 0 }}>
                Sign in first (Ranks tab) — saving a pin needs an account.
              </p>
            )}
            {addError && (
              <p className="tag tag-error" style={{ display: 'block', marginTop: 8, marginBottom: 0 }}>
                {addError}
              </p>
            )}
          </div>
        </div>
      )}
      {fixMode && (
        <div className="map-search-panel" style={{ top: 'auto', bottom: 'calc(var(--nav-h) + 16px)', maxWidth: 320 }}>
          <div className="card" style={{ padding: 12 }}>
            <strong>Fix Pin Locations</strong>
            <p className="screen-subtitle" style={{ margin: '4px 0 8px' }}>
              Drag any pin to where it actually belongs. {Object.keys(movedPins).length} moved so far.
            </p>
            {user ? (
              <button
                type="button"
                className="btn btn-primary btn-sm btn-block"
                disabled={Object.keys(movedPins).length === 0 || saving}
                onClick={submitMovedPins}
              >
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Submit'}
              </button>
            ) : (
              <p className="tag tag-error" style={{ display: 'block', margin: 0 }}>
                Sign in first (Ranks tab) — saving a fix needs an account.
              </p>
            )}
            {saveError && (
              <p className="tag tag-error" style={{ display: 'block', marginTop: 8, marginBottom: 0 }}>
                {saveError}
              </p>
            )}
          </div>
        </div>
      )}
      {removeMode && (
        <div className="map-search-panel" style={{ top: 'auto', bottom: 'calc(var(--nav-h) + 16px)', maxWidth: 320 }}>
          <div className="card" style={{ padding: 12 }}>
            <strong>Remove Pins</strong>
            <p className="screen-subtitle" style={{ margin: '4px 0 8px' }}>
              Drag a box around the custom pins to delete. Only pins added with ➕ can be removed this way —
              built-in landmarks aren't affected.
            </p>
            {selectedDocIds.length > 0 && (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  {selectedDocIds.length} pin{selectedDocIds.length !== 1 ? 's' : ''} selected.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={removing}
                    onClick={confirmRemoveSelected}
                  >
                    {removing ? 'Removing…' : 'Remove Selected'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}>
                    Clear
                  </button>
                </div>
              </>
            )}
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
