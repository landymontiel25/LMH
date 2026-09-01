import { useRef } from 'react';
import { CHECKIN_RADIUS_METERS, POINTS_PER_CHECKIN } from '../lib/leaderboard';

export default function CheckInButton({ landmark, user, firebaseEnabled, claimedMap, checkingIn, onCheckIn, className = '' }) {
  const fileRef = useRef(null);
  if (!firebaseEnabled) return null;

  const isClaimed = !!claimedMap[landmark.id];
  const busy = checkingIn === landmark.id;

  // A photo is REQUIRED to check in: tapping the button opens the camera / photo
  // library, and only a chosen photo actually completes the check-in. The photo
  // is proof you were there (more reliable than GPS) and builds the photo album.
  const openPicker = () => {
    if (isClaimed || !user || busy) return;
    fileRef.current?.click();
  };
  const onPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (f) onCheckIn(landmark, f);
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${isClaimed ? 'btn-success' : 'btn-primary'} ${className}`}
        disabled={isClaimed || !user || busy}
        title={!user ? 'Sign in to check in' : 'A photo is required to check in'}
        onClick={openPicker}
      >
        {isClaimed
          ? `✓ Checked In (+${landmark.points ?? POINTS_PER_CHECKIN})`
          : busy
          ? '…'
          : !user
          ? 'Sign in to Check In'
          : "\u{1F4F8} Check In with a Photo"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPick} />
    </>
  );
}
