import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { INTERESTS, REGIONS, getRegion } from '../data/regions';
import { nearestRegionId } from '../lib/geo';
import { useGeo } from '../lib/GeoContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useTrip } from '../lib/TripContext';
import { addCustomLandmark, uploadLandmarkPhoto } from '../lib/customLandmarks';
import { fileToSmallDataUrl } from '../lib/imageUtils';
import LocationAutocomplete from '../components/LocationAutocomplete';

const SAT_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
};

const DRAG_PIN_ICON = L.divIcon({
  className: '',
  html: '<div class="map-pin-wrap"><div class="map-pin map-pin-focus"></div></div>',
  iconSize: [26, 30],
  iconAnchor: [13, 28],
});

// Keeps the mini-map centered on wherever the pin currently is -- otherwise
// tapping "Use My Exact Location" would move the pin but leave the map
// looking at the old spot.
function RecenterOnPosition({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);
  return null;
}

// A brand-new landmark, start to finish: name, at least one topic, a photo,
// and its exact spot -- either your current GPS location or an actual pin
// you drag into place on a small map (much more obvious than tapping
// somewhere on the full explore map used to be). The AI verification +
// Firestore/Storage save is identical to what the old inline "Add Pin"
// panel on the map used to do.
export default function AddLandmark() {
  const navigate = useNavigate();
  const { coords } = useGeo();
  const { user, firebaseEnabled } = useCheckIn();
  const { trip } = useTrip();

  const startingCenter = () => {
    if (coords) return { lat: coords.lat, lng: coords.lng };
    const region = trip.activeRegion && getRegion(trip.activeRegion);
    return region?.center || REGIONS[0].center;
  };

  const [position, setPosition] = useState(startingCenter);
  const [addressText, setAddressText] = useState('');
  const [name, setName] = useState('');
  const [categories, setCategories] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [facts, setFacts] = useState([]);
  const [factDraft, setFactDraft] = useState('');
  const [stage, setStage] = useState('idle'); // idle | verifying | saving
  const [error, setError] = useState('');
  const busy = stage !== 'idle';

  const toggleCategory = (id) =>
    setCategories((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  const addFact = () => {
    const text = factDraft.trim();
    if (!text || facts.length >= 5) return;
    setFacts((cur) => [...cur, text]);
    setFactDraft('');
  };
  const removeFact = (i) => setFacts((cur) => cur.filter((_, idx) => idx !== i));

  const onPhotoChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const canSubmit = name.trim() && categories.length > 0 && photo && position && user;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError('');
    try {
      setStage('verifying');
      const imageDataUrl = await fileToSmallDataUrl(photo);
      const verifyRes = await fetch('/api/verify-landmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          categories,
          lat: position.lat,
          lng: position.lng,
          imageDataUrl,
          userFacts: facts,
        }),
      });
      const verified = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verified) throw new Error(verified?.error || 'Could not verify this submission — try again.');
      if (!verified.ok) throw new Error(verified.reason || "That doesn't look like a real place — try a different photo or name.");

      setStage('saving');
      const region = nearestRegionId(position.lat, position.lng);
      const tempId = `pending-${Date.now()}`;
      const imageUrl = await uploadLandmarkPhoto(tempId, user.uid, photo);
      const created = await addCustomLandmark({
        region,
        name: name.trim(),
        lat: position.lat,
        lng: position.lng,
        userId: user.uid,
        categories,
        images: [imageUrl],
        summary: verified.summary,
        facts: verified.facts,
        free: verified.free,
      });
      navigate(`/landmarks/${created.region}/${created.id}`);
    } catch (err) {
      setError(err.message || 'Could not save — try again.');
      setStage('idle');
    }
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        {'← Back'}
      </button>

      <h1 className="screen-title">
        <span>{'\u{2795}'}</span> Add Landmark
      </h1>
      <p className="screen-subtitle">
        Add a real place that's missing from the map. We'll AI-check it, then a moderator reviews it before it goes live.
      </p>

      <div className="field">
        <label>Location</label>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Drag the pin to the exact spot, use your current location, or search an address.
        </p>
        <div className="itinerary-map" style={{ height: 260 }}>
          <MapContainer center={[position.lat, position.lng]} zoom={17} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer url={SAT_TILE.url} attribution={SAT_TILE.attribution} />
            <RecenterOnPosition position={position} />
            <Marker
              position={[position.lat, position.lng]}
              icon={DRAG_PIN_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setPosition({ lat, lng });
                  setAddressText('');
                },
              }}
            />
          </MapContainer>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-block"
          style={{ marginTop: 10 }}
          disabled={!coords}
          onClick={() => {
            setPosition({ lat: coords.lat, lng: coords.lng });
            setAddressText('');
          }}
        >
          {'\u{1F4CD}'} {coords ? 'Use My Exact Location' : 'Locating…'}
        </button>
        <div style={{ marginTop: 10 }}>
          <LocationAutocomplete
            placeholder="Or search an address…"
            value={addressText}
            regionId={trip.activeRegion || nearestRegionId(position.lat, position.lng)}
            onChange={setAddressText}
            onSelect={(s) => {
              setPosition({ lat: s.lat, lng: s.lng });
              setAddressText(s.primary);
            }}
          />
        </div>
      </div>

      <div className="field">
        <label>Name</label>
        <input type="text" placeholder="e.g. Farley Hall" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label>Topic — pick at least one</label>
        <div className="chip-grid">
          {INTERESTS.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`chip ${categories.includes(i.id) ? 'selected' : ''}`}
              onClick={() => toggleCategory(i.id)}
            >
              <span className="chip-icon">{i.icon}</span>
              <span>{i.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Facts (optional)</label>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Know something true about it? Add a few — we won't make anything up ourselves.
        </p>
        {facts.map((f, i) => (
          <div
            key={i}
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6 }}
          >
            <span style={{ flex: 1 }}>{f}</span>
            <button type="button" className="btn btn-ghost btn-tight" onClick={() => removeFact(i)} aria-label="Remove fact">
              ✕
            </button>
          </div>
        ))}
        {facts.length < 5 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="e.g. Built by the class of 1998"
              value={factDraft}
              maxLength={160}
              onChange={(e) => setFactDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFact();
                }
              }}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-ghost btn-sm" disabled={!factDraft.trim()} onClick={addFact}>
              Add
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <label>Photo</label>
        {photoPreview ? (
          <div style={{ position: 'relative', width: 120 }}>
            <img
              src={photoPreview}
              alt="Preview"
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, display: 'block' }}
            />
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPhotoPreview(null);
              }}
              aria-label="Remove photo"
              style={{
                position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: '50%',
                border: 'none', background: 'rgba(0,0,0,0.78)', color: '#fff', cursor: 'pointer', lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <label className="btn btn-ghost btn-block" style={{ cursor: 'pointer' }}>
            {'\u{1F4F8}'} Add a photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoChange} />
          </label>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block" disabled={!canSubmit || busy} onClick={submit}>
        {stage === 'verifying' ? 'Verifying…' : stage === 'saving' ? 'Saving…' : 'Add Landmark'}
      </button>

      {!user && (
        <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
          {firebaseEnabled ? 'Sign in first (Profile tab) — adding a landmark needs an account.' : 'Accounts aren’t set up yet.'}
        </p>
      )}
      {error && (
        <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
