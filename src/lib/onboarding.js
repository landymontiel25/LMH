import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

// A one-time reward for finishing the post-signup onboarding flow
// (preferences + the first-check-in prompt) -- kept separate from the
// competitive leaderboard, same as referral bonuses, via the same
// bonusPoints field on the user's own profile doc.
export const ONBOARDING_BONUS_POINTS = 10;

// Guarded by the caller checking myProfile.onboardingCompleted first (see
// Profile's FirstCheckInStep) -- this only ever runs once per account.
export async function completeOnboarding(uid) {
  if (!db || !uid) return;
  await updateDoc(doc(db, 'users', uid), {
    onboardingCompleted: true,
    bonusPoints: increment(ONBOARDING_BONUS_POINTS),
  });
}
