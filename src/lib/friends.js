import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function getUserProfile(uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// Claim a unique username. `usernames/{name}` doubles as the uniqueness lock.
export async function claimUsername(user, rawName) {
  const username = (rawName || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new Error('3–20 characters: lowercase letters, numbers, or _');
  }
  const unameRef = doc(db, 'usernames', username);
  const userRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(unameRef);
    if (existing.exists() && existing.data().uid !== user.uid) {
      throw new Error('That username is already taken.');
    }
    const me = await tx.get(userRef);
    const oldName = me.exists() ? me.data().username : null;
    tx.set(unameRef, { uid: user.uid });
    tx.set(
      userRef,
      {
        uid: user.uid,
        username,
        displayName: user.displayName || username,
        email: (user.email || '').toLowerCase(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    if (oldName && oldName !== username) tx.delete(doc(db, 'usernames', oldName));
  });
  return username;
}

export async function findUserByUsername(rawName) {
  if (!db) return null;
  const username = (rawName || '').trim().toLowerCase().replace(/^@/, '');
  if (!username) return null;
  const unameSnap = await getDoc(doc(db, 'usernames', username));
  if (!unameSnap.exists()) return null;
  const userSnap = await getDoc(doc(db, 'users', unameSnap.data().uid));
  return userSnap.exists() ? userSnap.data() : null;
}

// Minimal searchable profile so friends can find each other by email.
export async function upsertUserProfile(user) {
  if (!db || !user) return;
  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      displayName: user.displayName || user.email,
      email: (user.email || '').toLowerCase(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Public: your reviews (comments, stars, photos) are visible to everyone.
// Private (default): only friends can see them -- matches the original
// friends-only photo rule this generalizes, now enforced in firestore.rules
// rather than just hidden client-side.
export async function setProfileVisibility(uid, isPublic) {
  if (!db || !uid) return;
  await setDoc(doc(db, 'users', uid), { public: !!isPublic, updatedAt: serverTimestamp() }, { merge: true });
}

// Home address + coords, used to zero out points for check-ins within
// HOME_RADIUS_METERS (see src/lib/leaderboard.js) -- also closes the
// self-submitted-landmark-near-home exploit. Same users/{uid} doc
// getUserProfile already reads, so it's available for free via
// FriendsContext's myProfile once saved.
export async function saveHomeLocation(uid, { address, lat, lng }) {
  if (!db || !uid) return;
  await setDoc(
    doc(db, 'users', uid),
    { homeAddress: address || '', homeCoords: { lat, lng }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Stamps when this account was last seen. Written once per session (on
// auth), not per action -- enough to answer "did they come back within 30
// days?" for the retention-by-ratings-count analysis without write spam.
export async function touchLastActive(uid) {
  if (!db || !uid) return;
  await setDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }, { merge: true });
}

export async function findUserByEmail(email) {
  if (!db) return null;
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', e)));
  return snap.docs[0]?.data() || null;
}

// Have I already sent toUid a request? A direct getDoc on the deterministic
// friend_requests/{fromUid}_{toUid} id would throw permission-denied when the
// doc doesn't exist yet (rules can't tell "not found" from "not yours" on a
// null resource), so this queries by "from" instead -- list rules evaluate
// per returned (i.e. existing) document, sidestepping that.
export async function hasPendingRequestTo(fromUid, toUid) {
  if (!db || !fromUid || !toUid) return false;
  const snap = await getDocs(query(collection(db, 'friend_requests'), where('from', '==', fromUid)));
  return snap.docs.some((d) => d.data().to === toUid);
}

export async function sendFriendRequest(fromUser, toUser) {
  if (fromUser.uid === toUser.uid) throw new Error("That's your own account.");
  const edge = await getDoc(doc(db, 'friend_edges', `${fromUser.uid}_${toUser.uid}`));
  if (edge.exists()) throw new Error('You two are already friends.');
  await setDoc(doc(db, 'friend_requests', `${fromUser.uid}_${toUser.uid}`), {
    from: fromUser.uid,
    fromName: fromUser.username || fromUser.displayName || fromUser.email,
    to: toUser.uid,
    toName: toUser.username || toUser.displayName || toUser.email,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function listIncomingRequests(uid) {
  // Single-field query (no composite index). Accepted/declined requests are
  // deleted, so everything addressed to you is a pending request.
  const snap = await getDocs(query(collection(db, 'friend_requests'), where('to', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function acceptRequest(req) {
  const batch = writeBatch(db);
  // Two directed edges so each user can query their own friends.
  batch.set(doc(db, 'friend_edges', `${req.to}_${req.from}`), {
    owner: req.to,
    friend: req.from,
    friendName: req.fromName,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'friend_edges', `${req.from}_${req.to}`), {
    owner: req.from,
    friend: req.to,
    friendName: req.toName,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(db, 'friend_requests', req.id));
  await batch.commit();
}

export async function declineRequest(req) {
  await deleteDoc(doc(db, 'friend_requests', req.id));
}

export async function listFriends(uid) {
  const snap = await getDocs(query(collection(db, 'friend_edges'), where('owner', '==', uid)));
  return snap.docs.map((d) => d.data());
}
