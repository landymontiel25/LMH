// Who can approve/reject a submitted landmark before it goes live. Plain
// email allowlist for now -- simplest thing that works for a couple of
// trusted people; swap for a real roles system later if this grows.
// This list is for the UI only (showing/hiding the review screen) -- the
// actual enforcement lives in firestore.rules' `custom_landmarks` `update`
// rule, which has its own copy of this same list. Keep both in sync.
export const ADMIN_EMAILS = ['landymontiel25@gmail.com'];

export function isAdmin(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
