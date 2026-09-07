import { useRef, useState } from 'react';
import { POINTS_PER_CHECKIN } from '../lib/leaderboard';

// Tapping "Check In" reveals two options: post the check-in as-is, or attach
// a photo first (opens the camera / photo library, then checks in once a
// photo's picked). Neither is required to claim the points.
export default function CheckInButton({ landmark, user, firebaseEnabled, claimedMap, checkingIn, onCheckIn, className = '' }) {
  const fileRef = useRef(null);
  const [choosing, setChoosing] = useState(false);
  if (!firebaseEnabled) return null;

  const isClaimed = !!claimedMap[landmark.id];
  const busy = checkingIn === landmark.id;

  const openChoice = () => {
    if (isClaimed || !user || busy) return;
    setChoosing(true);
  };
  const checkInNoPhoto = () => {
    setChoosing(false);
    onCheckIn(landmark);
  };
  const openPicker = () => fileRef.current?.click();
  const onPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    setChoosing(false);
    if (f) onCheckIn(landmark, f);
  };

  if (choosing) {
    return (
      <div className={`checkin-choice ${className}`} style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={checkInNoPhoto}>
          Check In
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={openPicker}>
          {'\u{1F4F8}'} With a Photo
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChoosing(false)} aria-label="Cancel">
          ✕
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPick} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-sm ${isClaimed ? 'btn-success' : 'btn-primary'} ${className}`}
      disabled={isClaimed || !user || busy}
      title={!user ? 'Sign in to check in' : 'Check in, with or without a photo'}
      onClick={openChoice}
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
