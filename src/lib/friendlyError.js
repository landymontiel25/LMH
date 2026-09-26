// Turns whatever went wrong (a Firebase error code, a failed fetch, an HTTP
// status, a thrown Error) into one short sentence a traveler can act on.
// Never shows raw backend text like "FirebaseError: [code=unavailable]".

const FIREBASE = {
  unavailable: "Can't reach the server right now. Check your connection and try again.",
  'deadline-exceeded': 'That took too long. Try again.',
  'permission-denied': "You don't have permission to do that. Try signing out and back in.",
  unauthenticated: 'Please sign in again to continue.',
  'resource-exhausted': 'Too many requests right now. Wait a moment and try again.',
  'not-found': "We couldn't find that. It may have been removed.",
  'already-exists': 'That already exists.',
  aborted: 'Someone else changed this at the same time. Try again.',
  cancelled: 'That was cancelled. Try again.',
  'storage/retry-limit-exceeded': 'The upload kept failing. Check your connection and try again.',
  'storage/unauthorized': "That photo couldn't be uploaded. Make sure it's an image under 8 MB.",
  'storage/canceled': 'Upload cancelled.',
  'storage/quota-exceeded': "Photo storage is full right now. Try again later.",
};

const HTTP = {
  400: "Something about that request didn't look right. Try again.",
  401: 'Please sign in to continue.',
  403: "You don't have access to that.",
  404: "We couldn't find that.",
  408: 'That took too long. Try again.',
  429: 'Too many requests in a row. Wait a moment and try again.',
  500: 'Something went wrong on our end. Try again in a moment.',
  502: 'Our server is having trouble. Try again in a moment.',
  503: 'This is temporarily unavailable. Try again in a moment.',
  504: 'That took too long. Try again.',
};

export const OFFLINE_MESSAGE = "You're offline. Reconnect and try again — nothing you entered was lost.";

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * friendlyError(err, fallback) -> string
 * err may be an Error, a Firebase error ({ code }), a fetch Response-shaped
 * error ({ status }), or an Error thrown with a server `error` message our
 * own /api endpoints already wrote in plain language (err.userMessage).
 */
export function friendlyError(err, fallback = 'Something went wrong. Try again.') {
  if (isOffline()) return OFFLINE_MESSAGE;
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err.userMessage) return err.userMessage;
  const code = String(err.code || '').replace(/^firestore\//, '');
  if (FIREBASE[code]) return FIREBASE[code];
  if (err.status && HTTP[err.status]) return HTTP[err.status];
  const msg = String(err.message || '');
  if (err.name === 'TypeError' && /fetch|network|load failed/i.test(msg)) {
    return "Can't reach the server right now. Check your connection and try again.";
  }
  if (/timed out|timeout/i.test(msg)) return 'That took too long. Try again.';
  return fallback;
}

/**
 * POSTs/GETs one of our own /api endpoints and returns parsed JSON, or
 * throws an Error carrying `status` and, when the server sent one, its
 * plain-language `error` text as `userMessage` (our endpoints write those
 * for people, not developers).
 */
export async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    const err = new Error(e?.message || 'Network error');
    err.name = 'TypeError';
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    if (data?.error && typeof data.error === 'string') err.userMessage = data.error;
    if (data?.code) err.code = data.code;
    throw err;
  }
  return data;
}
