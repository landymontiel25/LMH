// Verifies a Firebase ID token server-side without needing the
// firebase-admin SDK (which would need its own service-account secret this
// project doesn't have set up). The Identity Toolkit REST API can validate
// a token and return its account record using the same public Web API key
// the client already uses -- that key identifies the Firebase project, it
// isn't a secret, so this needs no new env var.
//
// Returns { uid, emailVerified } or null if the token is missing/invalid.
export async function verifyIdToken(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;

  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const account = data.users?.[0];
    return account ? { uid: account.localId, emailVerified: !!account.emailVerified } : null;
  } catch {
    return null;
  }
}
