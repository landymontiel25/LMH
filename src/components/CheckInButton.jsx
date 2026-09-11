import { useGeo } from '../lib/GeoContext';
import { CHECKIN_RADIUS_METERS, POINTS_PER_CHECKIN, distanceMeters } from '../lib/leaderboard';

// Opens the rate + post prompt (CheckInReview) — the check-in itself isn't
// registered until Post is tapped there. Gated on GPS: you must be within
// the landmark's radius (checkInRadiusMeters, default CHECKIN_RADIUS_METERS)
// of its real coordinates -- a photo alone was never real proof you went.
// Reads location itself via useGeo() rather than taking it as a prop: the
// marker lists that render this are memoized to skip rebuilding on every GPS
// tick (avoids the open popup flashing/closing), so a coords prop would go
// stale right when it matters most -- mid check-in.
//
// REQUIRE_PROXIMITY is off for now (temporary, per request) -- flip back to
// true to restore the GPS gate. Nothing else needs to change.
const REQUIRE_PROXIMITY = false;

export default function CheckInButton({ landmark, user, firebaseEnabled, claimedMap, checkingIn, onCheckIn, className = '' }) {
  const { coords } = useGeo();
  if (!firebaseEnabled) return null;

  const isClaimed = !!claimedMap[landmark.id];
  const busy = checkingIn === landmark.id;
  const radius = landmark.checkInRadiusMeters ?? CHECKIN_RADIUS_METERS;
  const hasPosition = landmark.lat != null && landmark.lng != null;
  const distance = hasPosition && coords ? distanceMeters(coords.lat, coords.lng, landmark.lat, landmark.lng) : null;
  const noLocation = REQUIRE_PROXIMITY && hasPosition && !coords;
  const tooFar = REQUIRE_PROXIMITY && distance != null && distance > radius;

  const handleClick = () => {
    if (isClaimed || !user || busy || noLocation || tooFar) return;
    onCheckIn(landmark);
  };

  const label = isClaimed
    ? `✓ Checked In (+${landmark.points ?? POINTS_PER_CHECKIN})`
    : busy
    ? '…'
    : !user
    ? 'Sign in to Check In'
    : noLocation
    ? 'Enable location to check in'
    : tooFar
    ? 'Get closer to check in'
    : "\u{1F4CD} Check In";

  return (
    <button
      type="button"
      className={`btn btn-sm ${isClaimed ? 'btn-success' : 'btn-primary'} ${className}`}
      disabled={isClaimed || !user || busy || noLocation || tooFar}
      title={!user ? 'Sign in to check in' : tooFar ? `You need to be within ${radius}m of this spot` : 'Check in'}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
