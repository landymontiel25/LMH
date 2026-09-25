import { auth } from './firebase';

// Authorization header for our own /api/* endpoints. The AI endpoints
// require a signed-in account (api/_lib/aiGuard.js) and count usage per
// account, so every call sends the current user's Firebase ID token.
// Signed out, this is empty and the server answers with a sign-in error.
export async function authHeaders() {
  const user = auth?.currentUser;
  if (!user) return {};
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}
