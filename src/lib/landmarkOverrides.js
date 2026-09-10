import { doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Corrected pin positions live in Firestore, keyed by region/id, and are
// merged over the static src/data/landmarks.*.js coordinates at render time.
// This is what makes a drag-to-fix on the map permanent for everyone instead
// of a one-off local change.
function overrideDocId(region, id) {
  return `${region}__${id}`;
}

export async function saveLandmarkPosition({ region, id, name, lat, lng, userId }) {
  await setDoc(doc(db, 'landmark_overrides', overrideDocId(region, id)), {
    region,
    id,
    name,
    lat,
    lng,
    updatedAt: serverTimestamp(),
    updatedBy: userId || null,
  });
}

// Returns { "regionId/landmarkId": { lat, lng } } for every saved override.
export async function getLandmarkOverrides() {
  if (!db) return {};
  const snap = await getDocs(collection(db, 'landmark_overrides'));
  const map = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    map[`${x.region}/${x.id}`] = { lat: x.lat, lng: x.lng };
  });
  return map;
}
