import { doc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

// A one-time reward for finishing the post-signup onboarding flow
// (preferences + the first-check-in prompt) -- kept separate from the
// competitive leaderboard, same as referral bonuses, via the same
// bonusPoints field on the user's own profile doc.
export const ONBOARDING_BONUS_POINTS = 10;

// Guarded by the caller checking myProfile.onboardingCompleted first (see
// Profile's FirstCheckInStep) -- this only ever runs once per account.
//
// setDoc(merge: true) rather than updateDoc: updateDoc rejects outright if
// users/{uid} doesn't exist yet, which silently ate this write (the caller's
// .catch swallowed it) whenever it raced upsertUserProfile's own fire-and-
// forget doc creation on the same page load -- the flag then read back as
// unset on the next load, resetting Profile to "Finish Onboarding" even
// though the in-session UI had already moved past it.
export async function completeOnboarding(uid) {
  if (!db || !uid) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      onboardingCompleted: true,
      bonusPoints: increment(ONBOARDING_BONUS_POINTS),
    },
    { merge: true }
  );
}
