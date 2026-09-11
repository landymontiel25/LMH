import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// "My Preferences" needs to follow the signed-in account, not just sit in this
// browser's localStorage -- otherwise it silently vanishes in a private
// window, on another device, or after clearing site data. Piggybacks on the
// existing users/{uid} doc (already used for the friends-by-email search).
export async function fetchSavedPreferences(uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data.savedInterests && !data.savedCustomInterests) return null;
  return {
    savedInterests: data.savedInterests || [],
    savedCustomInterests: data.savedCustomInterests || [],
  };
}

export async function pushSavedPreferences(uid, { savedInterests, savedCustomInterests }) {
  if (!db || !uid) return;
  await setDoc(doc(db, 'users', uid), { savedInterests, savedCustomInterests }, { merge: true });
}
