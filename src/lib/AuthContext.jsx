import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile,
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { auth, googleProvider, firebaseEnabled } from './firebase';
import { authErrorMessage } from './authErrors';
import { deleteAccountData } from './accountDeletion';

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
    // Best-effort -- a signup that succeeds shouldn't fail just because the
    // verification email didn't send. resendVerification lets them retry.
    sendEmailVerification(cred.user).catch(() => {});
    return cred.user;
  };

  const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const resendVerification = () => sendEmailVerification(auth.currentUser);

  // Firebase doesn't push a live update when emailVerified flips server-side
  // (clicking the link in another tab) -- reload() re-fetches the account
  // and this re-syncs it into state so the Profile banner can clear itself
  // without a full sign-out/sign-in.
  const refreshUser = async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    setUser({ ...auth.currentUser });
  };

  const signOutUser = () => signOut(auth);

  // Requires a password because Firebase rejects deleteUser on a session
  // that isn't "recent" -- reauthenticating first is the standard fix, and
  // it doubles as a real confirmation step for an irreversible action.
  // Firestore/Storage cleanup runs BEFORE deleteUser: once the Auth account
  // is gone, request.auth is null and every rule above that checks it would
  // reject the cleanup writes.
  const deleteAccount = async (password) => {
    const current = auth.currentUser;
    const cred = EmailAuthProvider.credential(current.email, password);
    await reauthenticateWithCredential(current, cred);
    await deleteAccountData(current.uid);
    await deleteUser(current);
  };

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
        resendVerification,
        refreshUser,
        signOutUser,
        deleteAccount,
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
