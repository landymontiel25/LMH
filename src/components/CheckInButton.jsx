import { POINTS_PER_CHECKIN } from '../lib/leaderboard';

// Opens the rate + post prompt (CheckInReview) — the check-in itself isn't
// registered until Post is tapped there.
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
