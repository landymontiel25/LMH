import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = firebaseEnabled && getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = firebaseEnabled ? getAuth(app) : null;
export const db = firebaseEnabled ? getFirestore(app) : null;
export const googleProvider = firebaseEnabled ? new GoogleAuthProvider() : null;

// Storage may not be provisioned (no bucket configured yet). Never let that
// crash the app — photo upload just stays disabled until it's set up.
let _storage = null;
if (firebaseEnabled) {
  try {
    _storage = getStorage(app);
  } catch {
    _storage = null;
  }
}
export const storage = _storage;
