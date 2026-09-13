import { doc, addDoc, updateDoc, deleteDoc, onSnapshot, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { notifyUser } from './notifications';

// A trip a few friends build together (item i6): one shared landmark list,
// visible and editable by every member. Only the owner can change who's a
// member (see firestore.rules) -- everyone else can only edit the shared
// landmark list.
//
// initialMembers ({ uid, name }[]) lets the owner invite friends in the same
// write that creates the trip -- e.g. from Trip Setup's friend picker --
// instead of creating an owner-only trip and then calling addGroupMember in
// a loop right after.
export async function createGroupTrip({ ownerUid, ownerName, name, regionId, landmarkIds = [], initialMembers = [] }) {
  const ref = await addDoc(collection(db, 'group_trips'), {
    ownerUid,
    name,
    regionId,
    memberUids: [ownerUid, ...initialMembers.map((m) => m.uid)],
    memberNames: {
      [ownerUid]: ownerName,
      ...Object.fromEntries(initialMembers.map((m) => [m.uid, m.name])),
    },
    landmarkIds,
    createdAt: serverTimestamp(),
  });
  // Let each invited friend know right away -- best-effort, since a
  // notification failing to write should never undo a successful invite.
  await Promise.all(
    initialMembers.map((m) =>
      notifyUser(m.uid, {
        type: 'group_invite',
        message: `\u{1F465} ${ownerName || 'A friend'} added you to a group trip: ${name}`,
        groupTripId: ref.id,
      }).catch(() => {})
    )
  );
  return ref.id;
}

export function subscribeGroupTrip(tripId, onData) {
  return onSnapshot(doc(db, 'group_trips', tripId), (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function listMyGroupTrips(uid) {
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, 'group_trips'), where('memberUids', 'array-contains', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function toggleGroupLandmark(trip, landmarkId) {
  const next = trip.landmarkIds.includes(landmarkId)
    ? trip.landmarkIds.filter((id) => id !== landmarkId)
    : [...trip.landmarkIds, landmarkId];
  await updateDoc(doc(db, 'group_trips', trip.id), { landmarkIds: next });
}

export async function addGroupMember(trip, memberUid, memberName) {
  if (trip.memberUids.includes(memberUid)) return;
  await updateDoc(doc(db, 'group_trips', trip.id), {
    memberUids: [...trip.memberUids, memberUid],
    memberNames: { ...trip.memberNames, [memberUid]: memberName },
    name: trip.name,
  });
  notifyUser(memberUid, {
    type: 'group_invite',
    message: `\u{1F465} You were added to a group trip: ${trip.name}`,
    groupTripId: trip.id,
  }).catch(() => {});
}

export async function removeGroupMember(trip, memberUid) {
  const memberNames = { ...trip.memberNames };
  delete memberNames[memberUid];
  await updateDoc(doc(db, 'group_trips', trip.id), {
    memberUids: trip.memberUids.filter((u) => u !== memberUid),
    memberNames,
    name: trip.name,
  });
}

export async function deleteGroupTrip(tripId) {
  await deleteDoc(doc(db, 'group_trips', tripId));
}
