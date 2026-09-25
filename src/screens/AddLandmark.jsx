import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { REGIONS, getRegion } from '../data/regions';
import CategorySelect from '../components/CategorySelect';
import { nearestRegionId, nearestAttributableRegionId } from '../lib/geo';
import { useGeo } from '../lib/GeoContext';
import { useCheckIn } from '../lib/useCheckIn';
import { useAuth } from '../lib/AuthContext';
import { authErrorMessage } from '../lib/authErrors';
import { useTrip } from '../lib/TripContext';
import { addCustomLandmark, uploadLandmarkPhoto } from '../lib/customLandmarks';
import { fileToSmallDataUrl, pickPhoto } from '../lib/imageUtils';
import LocationAutocomplete from '../components/LocationAutocomplete';

const SAT_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
};

const LABELS_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Place labels &copy; Esri',
};

const DRAG_PIN_ICON = L.divIcon({
  className: '',
  html: '<div class="map-pin-wrap"><div class="map-pin map-pin-focus"></div></div>',
  iconSize: [26, 30],
  iconAnchor: [13, 28],
});

// Every field's label states up front whether it's required to submit --
// Location, Name, and Topic are; Facts and Photo are optional.
function FieldLabel({ children, required }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{children}</span>
      <span className={`tag ${required ? '' : 'tag-optional'}`}>{required ? 'Required' : 'Optional'}</span>
    </label>
  );
}

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

// A brand-new landmark, start to finish: name, at least one topic, and its
// exact spot -- either your current GPS location or an actual pin you drag
// into place on a small map (much more obvious than tapping somewhere on
// the full explore map used to be). A photo is optional but speeds up the
// AI moderation check. The AI verification + Firestore/Storage save is
// identical to what the old inline "Add Pin" panel on the map used to do.
export default function AddLandmark() {
  const navigate = useNavigate();
  const location = useLocation();
  const { coords } = useGeo();
  const { user, firebaseEnabled } = useCheckIn();
  const { resendVerification } = useAuth();
  const { trip } = useTrip();

  // The map screen's "+" button passes along the exact spot you were
  // looking at (a dropped pin, or just the map's current center) so this
  // starts there instead of jumping to your GPS location.
  const startingCenter = () => {
    if (location.state?.lat != null && location.state?.lng != null) {
      return { lat: location.state.lat, lng: location.state.lng };
    }
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

  const regionId = nearestRegionId(position.lat, position.lng);

  const removeFact = (i) => setFacts((cur) => cur.filter((_, idx) => idx !== i));

  const addFact = () => {
    const value = factDraft.trim();
    if (!value) return;
    setFacts((cur) => [...cur, value]);
    setFactDraft('');
  };

  const onPhotoChange = async () => {
    const f = await pickPhoto();
    if (!f) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  // Address (the pin) is the only real requirement -- Name and Category are
  // optional (auto-filled below if left blank). It still always has SOME
  // value since the map defaults to your current location or the trip's region.
  const canSubmit = position && user;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError('');
    try {
      setStage('verifying');
      const imageDataUrl = photo ? await fileToSmallDataUrl(photo) : '';
      const idToken = await user.getIdToken();
      const finalName = name.trim() || addressText.trim() || 'New Landmark';
      const verifyRes = await fetch('/api/verify-landmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          name: finalName,
          categories,
          lat: position.lat,
          lng: position.lng,
          imageDataUrl,
          userFacts: facts,
        }),
      });
      const verified = await verifyRes.json().catch(() => null);
      if (verified?.code === 'email-not-verified') {
        // The original link is probably buried in an inbox from whenever they
        // signed up -- easier to try firing off a fresh one than ask them to
        // go dig for it. Firebase rate-limits repeat sends, though, and
        // resending on every failed attempt hits that limit fast -- so this
        // must only claim a new email went out when one actually did, or
        // someone stuck in this loop (rate-limited on every retry) keeps
        // getting told to check for a "fresh" link that was never sent.
        let resent = false;
        let resendErr = null;
        try {
          await resendVerification();
          resent = true;
        } catch (e) {
          // Surface the real reason instead of a silent swallow -- "it just
          // doesn't work" with no error code is undiagnosable. A specific
          // reason (rate-limited, network, etc.) is something we can act on.
          resendErr = e;
        }
        throw new Error(
          resent
            ? "Verify your email first — we just sent a fresh link to your inbox (check spam too), then try again."
            : `Verify your email first — check your inbox for the verification link we already sent you (check spam too), then try again. (Couldn't send another one: ${authErrorMessage(resendErr)})`
        );
      }
      if (!verifyRes.ok || !verified) throw new Error(verified?.error || 'Could not verify this submission — try again.');
      if (!verified.ok) throw new Error(verified.reason || "That doesn't look like a real place — try a different name or add a photo.");

      setStage('saving');
      // Unlike the search-biasing regionId above, this is permanent -- if
      // nothing curated is actually nearby, leave it unattributed (shows as
      // "Custom pin") rather than filing it under the wrong city/country.
      const region = nearestAttributableRegionId(position.lat, position.lng);
      const tempId = `pending-${Date.now()}`;
      const imageUrl = photo ? await uploadLandmarkPhoto(tempId, user.uid, photo) : null;
      // If no name was typed (finalName is just the address text) and the
      // AI's research clearly identified the real place there, save it
      // under that real name instead of the address -- but never override
      // a name the submitter actually typed themselves.
      const savedName = !name.trim() && verified.resolvedName ? verified.resolvedName : finalName;
      const created = await addCustomLandmark({
        region,
        name: savedName,
        lat: position.lat,
        lng: position.lng,
        userId: user.uid,
        // Category and photo are yours if you picked one -- the AI only
        // fills the gap when you left it blank, the same way it already
        // does for facts/summary.
        categories: categories.length ? categories : verified.category ? [verified.category] : [],
        images: imageUrl ? [imageUrl] : verified.imageUrl ? [verified.imageUrl] : [],
        summary: verified.summary,
        facts: verified.facts,
        free: verified.free,
        typicalMinutes: verified.typicalMinutes || undefined,
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
        Add a real place that's missing from the map. It goes live right away — we'll research it and fill in whatever
        you leave blank (category, photo, facts, and more).
      </p>

      <div className="field">
        <FieldLabel required>Location</FieldLabel>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Drag the pin to the exact spot, use your current location, or search an address.
        </p>
        <div className="itinerary-map" style={{ height: 260 }}>
          <MapContainer center={[position.lat, position.lng]} zoom={17} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer url={SAT_TILE.url} attribution={SAT_TILE.attribution} />
            <TileLayer url={LABELS_TILE.url} attribution={LABELS_TILE.attribution} zIndex={650} />
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
            regionId={regionId}
            onChange={setAddressText}
            onSelect={(s) => {
              // Move the pin, but leave the typed address text alone --
              // the geocoder's top match is sometimes the nearest known
              // business at that address, not the address itself, and
              // overwriting what was typed with that name is confusing.
              setPosition({ lat: s.lat, lng: s.lng });
            }}
          />
        </div>
      </div>

      <div className="field">
        <FieldLabel>Name</FieldLabel>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Leave blank and we'll use the address.
        </p>
        <input type="text" placeholder="e.g. Farley Hall" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <FieldLabel>Category</FieldLabel>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Leave blank and we'll research it and pick one.
        </p>
        <CategorySelect value={categories[0] || ''} onSelect={(id) => setCategories([id])} />
      </div>

      <div className="field">
        <FieldLabel>Facts</FieldLabel>
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
        <FieldLabel>Photo</FieldLabel>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: -4, marginBottom: 10 }}>
          Helps others recognize it. Skip it and we'll try to find a real photo of the place ourselves — never a stock
          photo or a guess.
        </p>
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
          <button type="button" className="btn btn-ghost btn-block" onClick={onPhotoChange}>
            {'\u{1F4F8}'} Add a photo
          </button>
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
