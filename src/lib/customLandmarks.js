import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

// User-created landmarks (e.g. a dorm hall not yet in the built-in catalog)
// live in their own Firestore collection and get merged onto the map
// alongside the static ones. Check-ins on them reuse the same claimCheckIn
// flow as any other landmark -- it only ever needs id/name/region.
export async function getCustomLandmarks() {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'custom_landmarks'));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

// Direct lookup by id -- the doc id and the `id` field are always the same
// value (set at creation below), so LandmarkDetail can fetch a single custom
// landmark the same way it'd look one up in the static catalog.
export async function getCustomLandmark(id) {
  if (!db || !id) return null;
  const snap = await getDoc(doc(db, 'custom_landmarks', id));
  return snap.exists() ? { docId: snap.id, ...snap.data() } : null;
}

// Reject after `ms` so a stalled Storage upload never hangs the submission.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), ms))]);
}

export async function uploadLandmarkPhoto(landmarkId, userId, file) {
  if (!storage) throw new Error('Photo upload is not set up yet.');
  const path = `landmark_photos/${landmarkId}/${userId}.jpg`;
  const storageRef = ref(storage, path);
  await withTimeout(uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' }), 20000);
  return withTimeout(getDownloadURL(storageRef), 10000);
}

// `categories`/`images`/`summary`/`facts`/`free`/`typicalMinutes` make this
// render as a full landmark (LandmarkDetail, LandmarkThumb, the map popup)
// instead of a bare pin -- filled in by the AI verification step before this
// is ever called.
export async function addCustomLandmark({
  region,
  name,
  lat,
  lng,
  userId,
  categories = [],
  images = [],
  summary = '',
  facts = [],
  free = true,
  typicalMinutes = 15,
}) {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = {
    region,
    id,
    name,
    lat,
    lng,
    categories,
    images,
    summary,
    facts,
    free,
    typicalMinutes,
    createdBy: userId || null,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'custom_landmarks', id), data);
  return { docId: id, ...data };
}

export async function deleteCustomLandmark(docId) {
  await deleteDoc(doc(db, 'custom_landmarks', docId));
}
