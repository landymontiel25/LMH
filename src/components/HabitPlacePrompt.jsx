import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useGeo } from '../lib/GeoContext';
import { useTrip } from '../lib/TripContext';
import { useFriends } from '../lib/FriendsContext';
import { reverseGeocodePlace, nearestRegionId, placeId } from '../lib/placeLookup';
import { distanceMeters } from '../lib/geo';
import { ALL_LANDMARKS } from '../data/regions';
import { notifyUser } from '../lib/notifications';
import {
  recordVisit,
  getDueSuggestion,
  typicalTimeLabel,
  recordPrompted,
  resolveClusterName,
  markLookupFailed,
  markClusterAdded,
  dismissCluster,
} from '../lib/habitTracking';

const RECORD_THROTTLE_MS = 60 * 1000; // one GPS fix folded in per minute is plenty for daily-habit clustering
const ALREADY_TRACKED_RADIUS_METERS = 80;

// "Mapr should learn where I go daily" -- this component is the only thing
// that touches habitTracking.js's storage from the UI: it feeds live
// GeoContext fixes in, and when a spot has become a real pattern (and the
// user is standing on it right now) it shows the ask. Mounted globally in
// App.jsx next to the other standing prompts (CheckInReview, TagCapPrompt,
// etc.), so it's live wherever you are in the app, not just on the map.
export default function HabitPlacePrompt() {
  const { user } = useAuth();
  const { coords } = useGeo();
  const { addPlace } = useTrip();
  const { myProfile } = useFriends();
  const uid = user?.uid;
  const enabled = myProfile?.habitTrackingEnabled !== false;
  const [suggestion, setSuggestion] = useState(null);
  const lastRecordedAtRef = useRef(0);
  const notifiedIdRef = useRef(null);

  const isAlreadyTracked = (lat, lng) =>
    ALL_LANDMARKS.some((l) => distanceMeters(lat, lng, l.lat, l.lng) <= ALREADY_TRACKED_RADIUS_METERS);

  useEffect(() => {
    if (!uid || !enabled || !coords) return;
    const now = Date.now();
    if (now - lastRecordedAtRef.current < RECORD_THROTTLE_MS) return;
    lastRecordedAtRef.current = now;
    recordVisit(uid, coords);
  }, [uid, enabled, coords]);

  useEffect(() => {
    if (!uid || !enabled || !coords || suggestion) return;
    const due = getDueSuggestion(uid, coords, { isAlreadyTracked });
    if (!due) return;

    if (!due.name) {
      reverseGeocodePlace(due.lat, due.lng).then((place) => {
        if (place) resolveClusterName(uid, due.id, place);
        else markLookupFailed(uid, due.id);
      });
      return;
    }

    setSuggestion(due);
    recordPrompted(uid, due.id);
    if (notifiedIdRef.current !== due.id) {
      notifiedIdRef.current = due.id;
      notifyUser(uid, { type: 'habit_place', message: `You keep going to ${due.name} — want to add it to an itinerary?` }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, enabled, coords, suggestion]);

  if (!suggestion) return null;

  const timeLabel = typicalTimeLabel(suggestion);

  const close = () => setSuggestion(null);

  const addToItinerary = () => {
    const regionId = nearestRegionId(suggestion.lat, suggestion.lng);
    if (regionId) {
      addPlace(regionId, {
        id: placeId(suggestion.name, suggestion.lat, suggestion.lng),
        name: suggestion.name,
        lat: suggestion.lat,
        lng: suggestion.lng,
        address: suggestion.address || '',
        source: 'habit',
      });
    }
    markClusterAdded(uid, suggestion.id);
    close();
  };

  const alreadyThere = () => {
    markClusterAdded(uid, suggestion.id);
    close();
  };

  const notNow = () => close();

  const stopTracking = () => {
    dismissCluster(uid, suggestion.id);
    close();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="habit-place-title">
        <h3 id="habit-place-title" style={{ marginTop: 0 }}>
          {'\u{1F4CD}'} You keep going here
        </h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          You've visited <strong>{suggestion.name}</strong>
          {timeLabel ? ` ${timeLabel}` : ''} on {suggestion.days.length} different days. Want to add it to an itinerary?
        </p>
        <button type="button" className="btn btn-block btn-success" onClick={addToItinerary}>
          {'\u{2795}'} Add to Itinerary
        </button>
        <button type="button" className="btn btn-block btn-ghost" style={{ marginTop: 8 }} onClick={alreadyThere}>
          {'\u{2705}'} It's already there
        </button>
        <button type="button" className="btn btn-block btn-ghost" style={{ marginTop: 8 }} onClick={notNow}>
          Not now
        </button>
        <button type="button" className="btn btn-block btn-ghost" style={{ marginTop: 8 }} onClick={stopTracking}>
          {'\u{1F6AB}'} Don't track this place
        </button>
      </div>
    </div>
  );
}
