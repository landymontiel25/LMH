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
import { getLandmarkOverrides, saveLandmarkPosition } from '../lib/landmarkOverrides';
import { getCustomLandmarks, deleteCustomLandmark, updateCustomLandmark } from '../lib/customLandmarks';
import { isAdmin } from '../lib/admins';
import { useAdminMode } from '../lib/AdminModeContext';
import { useLandmarkEdits } from '../lib/LandmarkEditsContext';
import { matchesSearch } from '../lib/search';
import CheckInButton from '../components/CheckInButton';
import DirectionsButton from '../components/DirectionsButton';
import LandmarkThumb from '../components/LandmarkThumb';
import QuickRateButton from '../components/QuickRateButton';

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
function PinDropHandler({ onDrop, disabled }) {
  useMapEvents({
    contextmenu(e) {
      if (disabled) return;
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
  const { adminMode } = useAdminMode();
  const { applyEdit } = useLandmarkEdits();
  const { myPhotos } = useMyPhotos();
  const navigate = useNavigate();
  const { coords, error: geoError, loading: geoLoading } = useGeo();
  const { units } = useUnits();
  const mapRef = useRef(null);
  const [satellite] = useState(true);
  const [radiusMiles, setRadiusMiles] = useZoomRadius();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Which categories to plot. Empty means "all landmarks" (the default);
  // otherwise only pins whose category is in the set. Grows with INTERESTS,
  // so every category added later is filterable here automatically.
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCats, setFilterCats] = useState(() => new Set());
  const toggleFilterCat = (id) =>
    setFilterCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const passesFilter = (l) => filterCats.size === 0 || (l.categories || []).some((c) => filterCats.has(c));

  // "Move pins" mode: built-in landmark markers become draggable and a
  // drop saves the corrected spot to the shared landmark_overrides
  // collection (landmarkOverrides.js) -- the same mechanism the old,
  // always-on drag-to-fix behavior wrote to, brought back as an explicit,
  // discoverable toggle instead. Requires being signed in (Firestore's own
  // rule for the collection does too); doesn't cover custom/user-submitted
  // landmarks, which already store their own exact position.
  const [editMode, setEditMode] = useState(false);
  const [pinSavedNote, setPinSavedNote] = useState(null);
  useEffect(() => {
    if (!pinSavedNote) return;
    const t = setTimeout(() => setPinSavedNote(null), 2500);
    return () => clearTimeout(t);
  }, [pinSavedNote]);
  const handlePinDragEnd = (l, e) => {
    const { lat, lng } = e.target.getLatLng();
    setSavedOverrides((prev) => ({ ...prev, [`${l.regionId}/${l.id}`]: { lat, lng } }));
    setPinSavedNote(l.name);
    saveLandmarkPosition({ region: l.regionId, id: l.id, name: l.name, lat, lng, userId: user?.uid }).catch(() => {
      // Firestore write failed -- the corrected pin still shows in the
      // right spot for this session, it just won't persist for everyone
      // until it's dragged again with a working connection.
    });
  };

  // A pin dropped by long-pressing an exact spot on the map -- lets you
  // pinpoint somewhere that isn't one of the built-in landmarks (e.g. a
  // specific building on a campus) and carry that exact location straight
  // into Add Landmark instead of having to re-find it there.
  const [pinDrop, setPinDrop] = useState(null);

  // "+" no longer jumps straight into Add Landmark -- it drops into this
  // mode instead: a crosshair stays fixed at the screen's center while you
  // pan the map underneath it, and every other control hides so the map
  // is the only thing on screen until you confirm with Done (or back out
  // with Cancel).
  const [placingPin, setPlacingPin] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('pin-placing', placingPin);
    return () => document.body.classList.remove('pin-placing');
  }, [placingPin]);

  const startPlacingPin = () => {
    setPinDrop(null);
    setSearchOpen(false);
    setEditMode(false);
    setPlacingPin(true);
  };

  const confirmPinPlacement = () => {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    setPlacingPin(false);
    navigate('/add-landmark', { state: { lat: center.lat, lng: center.lng } });
  };

  // Pin corrections made in "Move pins" mode, shared for everyone via
  // Firestore -- applied wherever a landmark's position is used below
  // (markers, search, nearby, and the "See it on the Map" highlight pin)
  // instead of falling back to the static source data's position.
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
  // LandmarkDetail snapshots the landmark's static lat/lng when it sets this
  // up -- apply any drag-to-fix correction here too, or the highlighted
  // "you came from here" pin sits at the OLD spot while the real marker (in
  // `markers` below) sits at the corrected one, which looks like two pins
  // for one landmark.
  const focusLandmarkPos = useMemo(() => {
    if (!focusLandmark) return null;
    const savedPos =
      focusLandmark.regionId && focusLandmark.id ? savedOverrides[`${focusLandmark.regionId}/${focusLandmark.id}`] : null;
    return { ...focusLandmark, lat: savedPos?.lat ?? focusLandmark.lat, lng: savedPos?.lng ?? focusLandmark.lng };
  }, [focusLandmark, savedOverrides]);

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
    // Includes the city/region name, category labels and facts too, joined
    // into one haystack -- so a query like "Miami F1" finds the Miami
    // International Autodrome even though no single field says "Miami F1"
    // verbatim (see matchesSearch: every WORD in the query has to appear
    // somewhere in the haystack, not the whole phrase in one field).
    const landmarkMatches = ALL_LANDMARKS.filter((l) => {
      const categoryLabels = l.categories?.map((c) => CATEGORY_LABEL[c]).filter(Boolean) ?? [];
      const haystack = [l.name, l.summary, getRegion(l.regionId)?.name, ...categoryLabels, ...(l.facts ?? [])].join(' ');
      return matchesSearch(haystack, term);
    }).map((l) => {
      // A drag-to-fix correction (savedOverrides) has to win here too, or
      // jumping to a landmark via search flies you back to its original,
      // wrong spot -- right next to where the corrected pin actually sits,
      // which reads as two of it on the map.
      const savedPos = savedOverrides[`${l.regionId}/${l.id}`];
      return {
        // A landmark's own id is only unique within its region (two cities
        // can both have a "the-battery"), so the region has to be part of
        // the key too -- otherwise two different results collide on one
        // React key and the list can visibly duplicate/misrender as you type.
        id: `landmark-${l.regionId}-${l.id}`,
        name: l.name,
        sub: getRegion(l.regionId)?.name,
        lat: savedPos?.lat ?? l.lat,
        lng: savedPos?.lng ?? l.lng,
        zoom: 17,
      };
    });
    // User-submitted landmarks were never searchable here -- only via the
    // map pins themselves or the Landmarks tab. Same id/key pattern as the
    // static matches above, just namespaced with "custom-" since a custom
    // landmark's own id (from customLandmarks.js) is already globally
    // unique on its own.
    const customMatches = customLandmarks
      .filter((l) => matchesSearch([l.name, l.summary, getRegion(l.region)?.name].join(' '), term))
      .map((l) => ({
        id: `custom-${l.docId}`,
        name: l.name,
        sub: getRegion(l.region)?.name,
        lat: l.lat,
        lng: l.lng,
        zoom: 17,
      }));
    const placeMatches = SEARCHABLE_PLACES.filter((p) => matchesSearch(p.name, term));
    return [...landmarkMatches, ...customMatches, ...placeMatches].slice(0, 8);
  }, [searchTerm, savedOverrides, customLandmarks]);

  const selectSearchResult = (result) => {
    setSearchFocus(result);
    setSearchOpen(false);
    setSearchTerm('');
    mapRef.current?.flyTo([result.lat, result.lng], result.zoom);
  };

  const toggleSearch = () => {
    setSearchOpen((open) => !open);
    setSearchTerm('');
    setFilterOpen(false);
    setEditMode(false);
  };

  const toggleEditMode = () => {
    setEditMode((on) => !on);
    setSearchOpen(false);
    setFilterOpen(false);
  };

  // A live, distance-sorted view of what's closest right now, shown in the
  // search panel before you type anything. Only meaningful with a real GPS
  // fix, so it's just not offered without one.
  const nearbyList = useMemo(() => {
    if (!coords) return [];
    const all = [
      ...ALL_LANDMARKS.map((l) => {
        const savedPos = savedOverrides[`${l.regionId}/${l.id}`];
        return {
          id: `landmark-${l.regionId}-${l.id}`,
          name: l.name,
          region: l.regionId,
          landmarkId: l.id,
          lat: savedPos?.lat ?? l.lat,
          lng: savedPos?.lng ?? l.lng,
        };
      }),
      ...customLandmarks.map((l) => ({ id: `custom-${l.docId}`, name: l.name, region: l.region, landmarkId: l.id, lat: l.lat, lng: l.lng })),
    ];
    return all
      .map((l) => ({ ...l, meters: distanceMeters(coords.lat, coords.lng, l.lat, l.lng) }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 12);
  }, [coords, customLandmarks, savedOverrides]);

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
      ALL_LANDMARKS.filter(passesFilter).map((l) => {
        // Admin Mode's live edit, if any -- id/regionId/lat/lng never
        // change this way (position is savedOverrides' job, just below),
        // only the display fields (name/category/summary/etc).
        const landmark = applyEdit(l);
        const isSelected = getRegionSelection(l.regionId).includes(l.id);
        const region = getRegion(l.regionId);
        const isClaimed = !!claimedMap[l.id];
        const goToDetails = () => navigate(`/landmarks/${l.regionId}/${l.id}`);
        const savedPos = savedOverrides[`${l.regionId}/${l.id}`];
        const position = savedPos ? [savedPos.lat, savedPos.lng] : [l.lat, l.lng];
        return (
          <Marker
            key={`${l.regionId}/${l.id}`}
            position={position}
            icon={pinIcon(isClaimed, isSelected)}
            draggable={editMode}
            eventHandlers={editMode ? { dragend: (e) => handlePinDragEnd(l, e) } : undefined}
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
                  <LandmarkThumb landmark={landmark} width={228} height={110} myPhoto={myPhotos[l.id]?.[0]} />
                </div>
                <div className="quick-rate-row" style={{ marginTop: 8 }}>
                  <h4 style={{ margin: 0 }}>{landmark.name}</h4>
                  <QuickRateButton landmark={landmark} />
                </div>
                <p style={{ margin: '2px 0 8px', fontSize: '0.72rem', color: 'var(--color-parchment-dim)' }}>
                  {region?.name}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                  {landmark.categories.map((c) => (
                    <span key={c} className="tag">
                      {CATEGORY_LABEL[c]}
                    </span>
                  ))}
                  <span className={`tag ${landmark.free ? 'tag-free' : ''}`}>{landmark.free ? 'Free' : 'Ticketed'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${isSelected ? 'btn-success' : 'btn-primary'}`}
                    onClick={() => handleAdd(landmark)}
                  >
                    {isSelected ? '✓ Added to Itinerary' : 'Add to Itinerary'}
                  </button>
                  <DirectionsButton name={landmark.name} lat={position[0]} lng={position[1]} className="btn btn-ghost btn-sm">
                    {'\u{1F9ED}'} Directions
                  </DirectionsButton>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={goToDetails}>
                    Details
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <CheckInButton
                    landmark={landmark}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- passesFilter only reads filterCats
    [trip.byRegion, claimedMap, checkingIn, user, firebaseEnabled, savedOverrides, filterCats, editMode, applyEdit]
  );

  // Admin Mode's pin-move for a custom landmark -- separate from the
  // crowd-sourced editMode drag-to-fix above (that one's open to any
  // signed-in user and only ever nudges built-in landmarks via
  // landmark_overrides). This writes straight onto the custom landmark's
  // own doc, admin-only per firestore.rules.
  const handleCustomPinDragEnd = (l, e) => {
    const { lat, lng } = e.target.getLatLng();
    setCustomLandmarks((prev) => prev.map((x) => (x.docId === l.docId ? { ...x, lat, lng } : x)));
    updateCustomLandmark(l.docId, { lat, lng }).catch(() => {
      // Revert this one pin on failure -- everything else stays as-is.
      setCustomLandmarks((prev) => prev.map((x) => (x.docId === l.docId ? { ...x, lat: l.lat, lng: l.lng } : x)));
    });
  };

  const customMarkers = useMemo(
    () =>
      customLandmarks.filter(passesFilter).map((l) => {
        const region = getRegion(l.region);
        // Same shape as a built-in landmark (regionId, categories/free
        // defaulted) so this popup can be the exact same one `markers`
        // renders below -- a custom landmark deserves the full card
        // (photo, category tags, Add to Itinerary, Details, Check In),
        // not a stripped-down one just for living in Firestore instead of
        // the static catalog. Still needs both regionId (claimCheckIn/
        // leaderboard) and region (submitReview's review doc) -- omitting
        // the latter used to write `region: undefined` into the review,
        // which the Firestore SDK rejects client-side.
        const landmark = {
          ...l,
          regionId: l.region,
          categories: l.categories || [],
          images: l.images || [],
          facts: l.facts || [],
          free: l.free ?? true,
        };
        const isSelected = getRegionSelection(l.region).includes(l.id);
        const isClaimed = !!claimedMap[l.id];
        const goToDetails = () => navigate(`/landmarks/${l.region}/${l.id}`);
        return (
          <Marker
            key={l.docId}
            position={[l.lat, l.lng]}
            icon={pinIcon(isClaimed, isSelected)}
            draggable={adminMode}
            eventHandlers={adminMode ? { dragend: (e) => handleCustomPinDragEnd(l, e) } : undefined}
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
                  <LandmarkThumb landmark={landmark} width={228} height={110} myPhoto={myPhotos[l.id]?.[0]} />
                </div>
                <div className="quick-rate-row" style={{ marginTop: 8 }}>
                  <h4 style={{ margin: 0 }}>{l.name}</h4>
                  <QuickRateButton landmark={landmark} />
                </div>
                <p style={{ margin: '2px 0 8px', fontSize: '0.72rem', color: 'var(--color-parchment-dim)' }}>
                  {region?.name || 'Custom pin'}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                  {landmark.categories.map((c) => (
                    <span key={c} className="tag">
                      {CATEGORY_LABEL[c]}
                    </span>
                  ))}
                  <span className={`tag ${landmark.free ? 'tag-free' : ''}`}>{landmark.free ? 'Free' : 'Ticketed'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${isSelected ? 'btn-success' : 'btn-primary'}`}
                    onClick={() => handleAdd(landmark)}
                  >
                    {isSelected ? '✓ Added to Itinerary' : 'Add to Itinerary'}
                  </button>
                  <DirectionsButton name={l.name} lat={l.lat} lng={l.lng} className="btn btn-ghost btn-sm">
                    {'\u{1F9ED}'} Directions
                  </DirectionsButton>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={goToDetails}>
                    Details
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <CheckInButton
                    landmark={landmark}
                    user={user}
                    firebaseEnabled={firebaseEnabled}
                    claimedMap={claimedMap}
                    checkingIn={checkingIn}
                    onCheckIn={checkIn}
                    className="btn-block"
                  />
                </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- passesFilter only reads filterCats
    [customLandmarks, claimedMap, checkingIn, user, firebaseEnabled, checkIn, navigate, filterCats, myPhotos, getRegionSelection, adminMode]
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
            focusPoint={focusLandmarkPos}
            radiusMiles={radiusMiles}
          />
          {!placingPin && <LocateControl coords={coords} radiusMiles={radiusMiles} />}
          <PinDropHandler onDrop={setPinDrop} disabled={placingPin} />
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
          {/* Both highlight pins sit on top of the real landmark marker at the
              same spot. interactive={false} gives them pointer-events: none, so
              a tap falls through to the real pin and opens its popup -- without
              it the highlight swallowed the tap and nothing happened. */}
          {focusLandmarkPos && (
            <Marker
              position={[focusLandmarkPos.lat, focusLandmarkPos.lng]}
              icon={focusIcon}
              zIndexOffset={1000}
              interactive={false}
            >
              {focusLandmarkPos.name && (
                <Tooltip permanent direction="top" offset={[0, -34]} className="focus-tooltip">
                  {focusLandmarkPos.name}
                </Tooltip>
              )}
            </Marker>
          )}
          {searchFocus && (
            <Marker
              position={[searchFocus.lat, searchFocus.lng]}
              icon={focusIcon}
              zIndexOffset={1000}
              interactive={false}
            >
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

      {!placingPin && (
        <>
          <button type="button" className="map-search-btn" title="Search landmarks" onClick={toggleSearch}>
            {searchOpen ? '\u{2715}' : '\u{1F50D}'}
          </button>
          <button
            type="button"
            className="map-search-btn map-add-btn"
            style={{ top: 'calc(var(--header-h) + 64px)' }}
            title="Add a landmark — long-press the map to pin an exact spot"
            onClick={startPlacingPin}
          >
            {'\u{2795}'}
          </button>
          <button
            type="button"
            className={`map-search-btn ${filterCats.size > 0 ? 'active' : ''}`}
            style={{ top: 'calc(var(--header-h) + 128px)' }}
            title="Filter the map by category"
            onClick={() => {
              setFilterOpen((o) => !o);
              setSearchOpen(false);
              setEditMode(false);
            }}
          >
            {filterOpen ? '\u{2715}' : '\u{1F5C2}\u{FE0F}'}
          </button>
          {filterOpen && (
            <div className="map-search-panel">
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.9rem' }}>Show on the map</p>
              <div className="map-filter-chips">
                <button
                  type="button"
                  className={`chip ${filterCats.size === 0 ? 'selected' : ''}`}
                  onClick={() => setFilterCats(new Set())}
                >
                  <span className="chip-icon">{'\u{1F4CD}'}</span>
                  <span>All landmarks</span>
                </button>
                {INTERESTS.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className={`chip ${filterCats.has(i.id) ? 'selected' : ''}`}
                    onClick={() => toggleFilterCat(i.id)}
                  >
                    <span className="chip-icon">{i.icon}</span>
                    <span>{i.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(!searchOpen && !filterOpen) || editMode ? (
            <button
              type="button"
              className={`map-edit-btn ${editMode ? 'active' : ''}`}
              disabled={!user}
              title={user ? 'Move pins to fix their spot' : 'Sign in to move pins'}
              onClick={toggleEditMode}
            >
              {editMode ? (
                '\u{2715}'
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="5" y1="6.5" x2="19" y2="6.5" />
                  <line x1="5" y1="11.5" x2="19" y2="11.5" />
                  <line x1="5" y1="16.5" x2="19" y2="16.5" />
                  <line x1="5" y1="21.5" x2="13" y2="21.5" />
                </svg>
              )}
            </button>
          ) : null}
          {pinSavedNote ? (
            <p className="tag tag-free map-edit-hint">Saved: {pinSavedNote}</p>
          ) : (
            editMode && <p className="tag map-edit-hint">Drag a pin to fix its spot — saves for everyone</p>
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
              {!searchTerm.trim() && coords && (
                <div className="map-search-results">
                  <div className="map-search-heading">{'\u{1F4E1}'} Nearby now</div>
                  {nearbyList.length === 0 && <div className="map-search-empty">Nothing nearby yet.</div>}
                  {nearbyList.map((l) => (
                    <button
                      type="button"
                      key={l.id}
                      className="map-search-result"
                      onClick={() => selectSearchResult({ ...l, zoom: 17 })}
                    >
                      <span className="map-search-result-name">{l.name}</span>
                      <span className="map-search-result-city">{formatDistance(l.meters, units)} away</span>
                    </button>
                  ))}
                </div>
              )}
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
        </>
      )}

      {placingPin && (
        <>
          <div className="map-pin-target" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <line x1="18" y1="1" x2="18" y2="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="18" y1="27" x2="18" y2="35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="1" y1="18" x2="9" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="27" y1="18" x2="35" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="18" r="7" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="2" fill="currentColor" />
            </svg>
          </div>
          <p className="map-pin-target-hint">Pan the map to line up your spot</p>
          <button type="button" className="map-search-btn map-pin-cancel-btn" title="Cancel" onClick={() => setPlacingPin(false)}>
            {'\u{2715}'}
          </button>
          <button type="button" className="btn btn-primary map-pin-done-btn" onClick={confirmPinPlacement}>
            Done
          </button>
        </>
      )}

      {geoError && <p className="tag tag-error map-error-toast">Location unavailable — {geoError}</p>}
    </div>
  );
}
