import { doc, setDoc, deleteDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// User-created landmarks (e.g. a dorm hall not yet in the built-in catalog)
// live in their own Firestore collection and get merged onto the map
// alongside the static ones. Check-ins on them reuse the same claimCheckIn
// flow as any other landmark -- it only ever needs id/name/region.
export async function getCustomLandmarks() {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'custom_landmarks'));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

export async function addCustomLandmark({ region, name, lat, lng, userId }) {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = { region, id, name, lat, lng, createdBy: userId || null, createdAt: serverTimestamp() };
  await setDoc(doc(db, 'custom_landmarks', id), data);
  return { docId: id, ...data };
}

export async function deleteCustomLandmark(docId) {
  await deleteDoc(doc(db, 'custom_landmarks', docId));
}
