import { useNavigate } from 'react-router-dom';
import { useTrip } from '../lib/TripContext';
import { usePersistentState } from '../lib/usePersistentState';
import { INTERESTS } from '../data/regions';
import { nearestRegionId } from '../lib/geo';
import { useGpsStartLocation } from '../lib/useGpsStartLocation';
import LocationAutocomplete, { HomeStartPrefill } from './LocationAutocomplete';
import MultiRegionSearch from './MultiRegionSearch';

const isFalsy = (v) => !v;
const isSolo = (v) => v === 'solo';

const MOODS = [
  { id: 'energized', icon: '\u{26A1}', label: 'Energized & Active', hint: 'upbeat, on your feet, go-go-go' },
  { id: 'easygoing', icon: '\u{1F634}', label: 'Easygoing & Chill', hint: 'relaxed, slower pace, low-key' },
];

// The card version of TripSetup's form, dropped right into Mapr instead of
// its own screen -- pick a few things, tap "Plan My Trip", and it turns
// straight into a chat message Mapr answers like any other, so a trip
// starts as a real conversation instead of a static route. Reuses the same
// trip state (TripContext) TripSetup/Itinerary read, so anything picked
// here still applies if you later open "Create New Trip" too.
export default function TripPlannerCard({ regions, onToggleRegion, onClearRegions, onClose, onPlan }) {
  const { trip, updateTrip, applyPreferences } = useTrip();
  const { useCurrentLocation, locating, locateError, usingGps } = useGpsStartLocation();
  const navigate = useNavigate();
  // Everything else on the card (start, interests, cities) already lives in
  // saved trip/chat state; these three were the only picks a closed app
  // lost. Cleared once the card turns into a chat message.
  const [preferencesSelected, setPreferencesSelected] = usePersistentState('mapr.planner.prefs', false, { isEmpty: isFalsy });
  const [tripMode, setTripMode] = usePersistentState('mapr.planner.mode', 'solo', { isEmpty: isSolo }); // 'solo' | 'group'
  const [mood, setMood] = usePersistentState('mapr.planner.mood', null); // null | 'energized' | 'easygoing'

  const togglePreferences = () => {
    if (preferencesSelected) {
      updateTrip({ interests: [], customInterests: [] });
    } else {
      applyPreferences();
    }
    setPreferencesSelected((s) => !s);
  };

  const toggleInterest = (id) => {
    const has = trip.interests.includes(id);
    updateTrip({ interests: has ? trip.interests.filter((i) => i !== id) : [...trip.interests, id] });
  };

  const planTrip = () => {
    const parts = ['Plan a trip for me.'];
    if (mood) {
      parts.push(mood === 'energized' ? "I'm in the mood for something energized and active." : "I'm in the mood for something easygoing and chill.");
    }
    parts.push(tripMode === 'group' ? "It's for a group." : "It's just me.");
    if (trip.startingLocation) parts.push(`Starting from ${trip.startingLocation}.`);
    if (regions.length) parts.push(`In ${regions.map((r) => r.name).join(' or ')}.`);
    const interestLabels = [
      ...trip.interests.map((id) => INTERESTS.find((i) => i.id === id)?.label).filter(Boolean),
      ...trip.customInterests,
    ];
    if (interestLabels.length) parts.push(`I'm interested in: ${interestLabels.join(', ')}.`);
    onPlan(parts.join(' '));
    // Back to defaults, which the saved copies treat as "nothing to restore".
    setPreferencesSelected(false);
    setTripMode('solo');
    setMood(null);
  };

  return (
    <div className="card section trip-planner-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{'\u{1F9ED}'} Plan Your Trip</h3>
        <button type="button" className="tag" style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }} onClick={onClose}>
          {'\u{2715}'} Close
        </button>
      </div>

      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => navigate('/')}>
        {'\u{1F310}'} Just Browse the Map
      </button>

      <div className="field" style={{ marginTop: 14 }}>
        <label>Starting Location <span style={{ fontWeight: 400, color: 'var(--color-parchment-dim)' }}>(optional)</span></label>
        <button
          type="button"
          className={`btn btn-sm ${usingGps ? 'btn-primary' : 'btn-ghost'}`}
          style={{ marginBottom: 10 }}
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {'\u{1F4CD}'} {locating ? 'Locating…' : usingGps ? 'Using Your Current Location' : 'Use My Current Location'}
        </button>
        <LocationAutocomplete
          name="start-location"
          id="planner-start"
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
        <HomeStartPrefill />
        {locateError && (
          <p className="tag tag-error" style={{ marginTop: 6 }}>
            {locateError}
          </p>
        )}
      </div>

      <div className="field">
        <label>Region</label>
        <MultiRegionSearch selectedIds={regions.map((r) => r.id)} onToggle={onToggleRegion} onClearAll={onClearRegions} placeholder="Add a city…" />
      </div>

      <div className="field">
        <label>What are you interested in?</label>
        {(trip.savedInterests.length > 0 || trip.savedCustomInterests.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <button type="button" className={`chip ${preferencesSelected ? 'selected' : ''}`} onClick={togglePreferences}>
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
        </div>
      </div>

      <div className="field">
        <label>What are you in the mood for?</label>
        <p className="screen-subtitle" style={{ marginTop: -4 }}>
          You might love hiking on a Sunday morning and still want nothing to do with it on a Saturday night out.
        </p>
        <div className="chip-grid">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${mood === m.id ? 'selected' : ''}`}
              title={m.hint}
              onClick={() => setMood((cur) => (cur === m.id ? null : m.id))}
            >
              <span className="chip-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Trip Type</label>
        <div className="tabs" style={{ justifyContent: 'center' }}>
          <button type="button" className={`tab-btn ${tripMode === 'solo' ? 'active' : ''}`} onClick={() => setTripMode('solo')}>
            {'\u{1F464}'} Solo
          </button>
          <button type="button" className={`tab-btn ${tripMode === 'group' ? 'active' : ''}`} onClick={() => setTripMode('group')}>
            {'\u{1F465}'} Group
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 4 }} onClick={planTrip}>
        {'\u{2728}'} Plan My Trip {'\u{2192}'}
      </button>
    </div>
  );
}
