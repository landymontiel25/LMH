import { POINTS_PER_CHECKIN } from '../lib/leaderboard';

// Checks in immediately, no photo required. The post-check-in rating prompt
// (CheckInReview) is where a photo can optionally be attached afterward.
export default function CheckInButton({ landmark, user, firebaseEnabled, claimedMap, checkingIn, onCheckIn, className = '' }) {
  if (!firebaseEnabled) return null;

  const isClaimed = !!claimedMap[landmark.id];
  const busy = checkingIn === landmark.id;

  const handleClick = () => {
    if (isClaimed || !user || busy) return;
    onCheckIn(landmark);
  };

  return (
    <button
      type="button"
      className={`btn btn-sm ${isClaimed ? 'btn-success' : 'btn-primary'} ${className}`}
      disabled={isClaimed || !user || busy}
      title={!user ? 'Sign in to check in' : 'Check in'}
      onClick={handleClick}
    >
      {isClaimed
        ? `✓ Checked In (+${landmark.points ?? POINTS_PER_CHECKIN})`
        : busy
        ? '…'
        : !user
        ? 'Sign in to Check In'
        : "\u{1F4CD} Check In"}
    </button>
  );
}
