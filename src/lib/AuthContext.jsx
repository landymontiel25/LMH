import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider, firebaseEnabled } from './firebase';
import { authErrorMessage } from './authErrors';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState('');

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }
    // Google sign-in uses a full-page redirect (not a popup) because popups are
    // unreliable on mobile browsers — often silently blocked on mobile Safari/Chrome.
    // This catches the result once the browser comes back from Google.
    getRedirectResult(auth).catch((err) => setRedirectError(authErrorMessage(err)));
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = () => signInWithRedirect(auth, googleProvider);

  const signUpEmail = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
      setUser({ ...cred.user, displayName });
    }
    return cred.user;
  };

  const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const signOutUser = () => signOut(auth);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        firebaseEnabled,
        signInGoogle,
        signUpEmail,
        signInEmail,
        resetPassword,
        signOutUser,
        redirectError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
