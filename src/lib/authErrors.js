const MESSAGES = {
  'auth/invalid-credential': "That email/password combo doesn't match an account — double-check them, or if you originally signed in with Google, use \"Continue with Google\" instead (Google accounts don't have a password here).",
  'auth/email-already-in-use': 'An account already exists with that email — try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': "That doesn't look like a valid email address.",
  'auth/popup-blocked': 'Your browser blocked the sign-in popup — try again or check your popup-blocker settings.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts — wait a bit before trying again.',
};

export function authErrorMessage(err) {
  return MESSAGES[err?.code] || err?.message?.replace('Firebase: ', '') || 'Something went wrong signing in.';
}
