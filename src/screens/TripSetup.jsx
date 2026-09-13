import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTrip } from '../lib/TripContext';
import { INTERESTS, getRegion } from '../data/regions';
import { nearestRegionId } from '../lib/geo';
import { classifyInterest } from '../lib/interestClassifier';
import LocationAutocomplete from '../components/LocationAutocomplete';
import AddInterestChip from '../components/AddInterestChip';
import RegionSearch from '../components/RegionSearch';

const CURRENT_LOCATION_LABEL = 'Your Current Location';

export default function TripSetup() {
  const { trip, updateTrip, setCustomInterestMatches, setCustomInterestEmoji, removeCustomInterest, applyPreferences } =
    useTrip();
  const navigate = useNavigate();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  // Custom interests (e.g. "nightlife", "racing") aren't tagged on any landmark,
  // so the AI has to figure out which ones fit while this stays showing "finding
  // matches…" on the chip. Not persisted -- it's re-derived from the trip's own
  // pending state (a custom interest with no matches entry yet).
  const [classifying, setClassifying] = useState(() => new Set());
  // Whether "Use My Preferences" is toggled on -- an explicit on/off flag
  // rather than something derived from comparing trip.interests to
  // savedInterests, since those can coincidentally match (or drift apart
  // after you tweak a chip by hand) without you ever touching this control.
  const [preferencesSelected, setPreferencesSelected] = useState(false);

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocateError('Geolocation is not supported on this device.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        updateTrip({
          startingLocation: CURRENT_LOCATION_LABEL,
          startingCoords: { lat, lng },
          activeRegion: nearestRegionId(lat, lng),
        });
        setLocating(false);
      },
      (err) => {
        setLocateError(err.message || 'Unable to get your location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const toggleInterest = (id) => {
    const has = trip.interests.includes(id);
    updateTrip({
      interests: has ? trip.interests.filter((i) => i !== id) : [...trip.interests, id],
    });
  };

  const addCustomInterest = (text) => {
    if (trip.customInterests.includes(text)) return;
    updateTrip({ customInterests: [...trip.customInterests, text] });
    setClassifying((cur) => new Set(cur).add(text));
    classifyInterest(text).then(({ matches, emoji }) => {
      setCustomInterestMatches(text, matches);
      setCustomInterestEmoji(text, emoji);
      setClassifying((cur) => {
        const next = new Set(cur);
        next.delete(text);
        return next;
      });
    });
  };

  const selectRegion = (region) => {
    if (region.id === trip.activeRegion) return;
    updateTrip({ activeRegion: region.id, startingLocation: '', startingCoords: null });
  };

  const activeRegion = getRegion(trip.activeRegion) || { name: '' };

  const canContinue = !!trip.activeRegion;

  const togglePreferences = () => {
    if (preferencesSelected) {
      updateTrip({ interests: [], customInterests: [] });
    } else {
      applyPreferences();
    }
    setPreferencesSelected((s) => !s);
  };

  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F9ED}'}</span> Plan Your Trip
      </h1>
      <p className="screen-subtitle">Tell us where you're starting and what you're into — we'll build the route.</p>

      <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 24 }} onClick={() => navigate('/')}>
        {'\u{1F310}'} Just Browse the Map First
      </button>

      <div className="field">
        <label htmlFor="start">
          Starting Location <span style={{ fontWeight: 400, color: 'var(--color-parchment-dim)' }}>(optional)</span>
        </label>
        <button
          type="button"
          className={`btn btn-sm ${trip.startingLocation === CURRENT_LOCATION_LABEL ? 'btn-primary' : 'btn-ghost'}`}
          style={{ marginBottom: 10 }}
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {'\u{1F4CD}'} {locating ? 'Locating…' : 'Use My Current Location'}
        </button>
        <LocationAutocomplete
          id="start"
          placeholder="Or type an address, hotel, etc."
          value={trip.startingLocation}
          onChange={(text) => updateTrip({ startingLocation: text, startingCoords: null })}
          onSelect={(s) =>
            updateTrip({
              startingLocation: s.primary,
              startingCoords: { lat: s.lat, lng: s.lng },
              activeRegion: nearestRegionId(s.lat, s.lng),
            })
          }
        />
        {locateError && (
          <p className="tag tag-error" style={{ marginTop: 6 }}>
            {locateError}
          </p>
        )}
        {!trip.startingLocation && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginTop: 6 }}>
            No starting point set — the itinerary will route from wherever you are.
          </p>
        )}
      </div>

      <div className="field">
        <label>Region</label>
        <RegionSearch region={activeRegion} onSelect={selectRegion} placeholder="Search for a region…" />
      </div>

      <div className="field">
        <label>What are you interested in?</label>
        {trip.savedInterests.length === 0 && trip.savedCustomInterests.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-parchment-dim)', marginBottom: 10 }}>
            Save your usual picks on your <Link to="/profile">Profile</Link> to fill this in with one tap.
          </p>
        )}
        {(trip.savedInterests.length > 0 || trip.savedCustomInterests.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <button
              type="button"
              className={`chip ${preferencesSelected ? 'selected' : ''}`}
              onClick={togglePreferences}
            >
              <span className="chip-icon">{'⭐'}</span>
              <span>Use My Preferences</span>
            </button>
          </div>
        )}
        <div className="chip-grid">
          {INTERESTS.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`chip ${trip.interests.includes(i.id) ? 'selected' : ''}`}
              onClick={() => toggleInterest(i.id)}
            >
              <span className="chip-icon">{i.icon}</span>
              <span>{i.label}</span>
            </button>
          ))}
          {trip.customInterests.map((text) => (
            <div
              key={text}
              className="chip selected"
              style={{ cursor: 'default' }}
              title={classifying.has(text) ? 'Finding matching landmarks…' : undefined}
            >
              <span className="chip-icon">
                {classifying.has(text) ? '\u{23F3}' : trip.customInterestEmoji[text] || '\u{2728}'}
              </span>
              <span>{text}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${text}`}
                onClick={() => removeCustomInterest(text)}
              >
                {'\u{1F5D1}\u{FE0F}'}
              </button>
            </div>
          ))}
          <AddInterestChip existing={trip.customInterests} onAdd={addCustomInterest} />
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!canContinue}
        onClick={() => navigate('/landmarks')}
      >
        Choose Landmarks {'\u{2192}'}
      </button>
    </div>
  );
}
