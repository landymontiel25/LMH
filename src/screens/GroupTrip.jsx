import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getRegion } from '../data/regions';
import { listFriends } from '../lib/friends';
import {
  subscribeGroupTrip,
  toggleGroupLandmark,
  setGroupLandmarks,
  addGroupMember,
  removeGroupMember,
  deleteGroupTrip,
} from '../lib/groupTrips';
import { friendlyError } from '../lib/friendlyError';
import { runOptimistic, useToast } from '../lib/ToastContext';
import ErrorNotice from '../components/ErrorNotice';
import { Skeleton, SkeletonList } from '../components/Skeleton';

// Same outline as the loaded screen: back button, title, members card,
// landmarks card.
function GroupTripSkeleton() {
  return (
    <div className="skeleton-screen" role="status" aria-live="polite">
      <span className="visually-hidden">Loading group trip…</span>
      <Skeleton width={120} height={30} radius={999} style={{ marginBottom: 12 }} />
      <Skeleton width="55%" height={30} radius={10} style={{ marginBottom: 10 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: 18 }} />
      <div className="card section">
        <Skeleton width="30%" height={18} style={{ marginBottom: 12 }} />
        <SkeletonList count={2} label="Loading members" />
      </div>
      <div className="card section">
        <Skeleton width="45%" height={18} style={{ marginBottom: 12 }} />
        <SkeletonList count={4} label="Loading landmarks" />
      </div>
    </div>
  );
}

// One trip a few friends build together (item i6) -- a single shared
// landmark list, live-updated for every member via subscribeGroupTrip.
export default function GroupTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [trip, setTrip] = useState(null);
  // 'loading' | 'ready' | 'missing' (deleted, or you're not a member --
  // Firestore can't tell us which) | 'error' (couldn't reach it; retryable)
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [friends, setFriends] = useState([]);
  const [friendsError, setFriendsError] = useState(null);
  // Landmark ticks you've made that the server hasn't confirmed yet, so the
  // checkbox flips the instant you tap it. { [landmarkId]: true | false }
  const [pendingLandmarks, setPendingLandmarks] = useState({});

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return undefined;
    setStatus('loading');
    setLoadError(null);
    const unsub = subscribeGroupTrip(
      tripId,
      (data) => {
        setTrip(data);
        setStatus(data ? 'ready' : 'missing');
      },
      (err) => {
        const code = String(err?.code || '');
        if (code === 'permission-denied' || code === 'not-found') {
          setStatus('missing');
        } else {
          setLoadError(err);
          setStatus('error');
        }
      }
    );
    return unsub;
  }, [tripId, uid, attempt]);

  const loadFriends = () => {
    if (!uid) return;
    setFriendsError(null);
    listFriends(uid).then(setFriends).catch(setFriendsError);
  };
  useEffect(() => {
    loadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const back = (
    <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/itinerary')}>
      {'← Itineraries'}
    </button>
  );

  if (authLoading || (user && status === 'loading')) return <GroupTripSkeleton />;

  if (!user) {
    return (
      <div>
        {back}
        <div className="empty-state">
          <p>
            <Link to="/profile">Sign in</Link> to see this group trip.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        {back}
        <ErrorNotice
          error={loadError}
          message={friendlyError(loadError, "Couldn't load this group trip.")}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      </div>
    );
  }

  if (status === 'missing' || !trip) {
    return (
      <div>
        {back}
        <div className="empty-state">
          <p>{'\u{1F465}'} This group trip isn't available. It may have been deleted, or you're not a member of it.</p>
        </div>
      </div>
    );
  }

  const region = getRegion(trip.regionId);
  const isOwner = trip.ownerUid === user.uid;
  const invitable = friends.filter((f) => !trip.memberUids.includes(f.friend));
  const isSelected = (id) => (id in pendingLandmarks ? pendingLandmarks[id] : trip.landmarkIds.includes(id));
  const selectedCount = (region?.landmarks || []).filter((l) => isSelected(l.id)).length;

  const setLandmark = (landmark, add) => {
    const clearPending = () =>
      setPendingLandmarks((cur) => {
        const next = { ...cur };
        delete next[landmark.id];
        return next;
      });
    runOptimistic({
      apply: () => setPendingLandmarks((cur) => ({ ...cur, [landmark.id]: add })),
      commit: () => toggleGroupLandmark(trip, landmark.id, add).then(clearPending),
      rollback: clearPending,
      toast,
      errorMessage: `Couldn't ${add ? 'add' : 'remove'} ${landmark.name}, so we put it back.`,
      retry: () => setLandmark(landmark, add),
    });
  };

  const regionLandmarks = region?.landmarks || [];
  const allSelected = regionLandmarks.length > 0 && selectedCount === regionLandmarks.length;
  const setAll = (add) => {
    const ids = regionLandmarks.filter((l) => isSelected(l.id) !== add).map((l) => l.id);
    if (!ids.length) return;
    const clearPending = () =>
      setPendingLandmarks((cur) => {
        const next = { ...cur };
        ids.forEach((id) => delete next[id]);
        return next;
      });
    runOptimistic({
      apply: () => setPendingLandmarks((cur) => ({ ...cur, ...Object.fromEntries(ids.map((id) => [id, add])) })),
      commit: () => setGroupLandmarks(trip, ids, add).then(clearPending),
      rollback: clearPending,
      toast,
      errorMessage: add ? "Couldn't select them all, so we put the list back." : "Couldn't clear the list, so we put it back.",
      retry: () => setAll(add),
    });
  };

  // Member changes show up right away through Firestore's own local copy of
  // the trip (the snapshot above fires before the server confirms) and are
  // undone the same way if the write is refused -- this just makes sure a
  // refusal is said out loud, with a way to try again.
  const addMember = (f) =>
    runOptimistic({
      commit: () => addGroupMember(trip, f.friend, f.friendName),
      toast,
      errorMessage: `Couldn't add ${f.friendName || 'that friend'}. Try again.`,
      retry: () => addMember(f),
    });
  const removeMember = (memberUid) =>
    runOptimistic({
      commit: () => removeGroupMember(trip, memberUid),
      toast,
      errorMessage: `Couldn't remove ${trip.memberNames?.[memberUid] || 'that member'}. Try again.`,
      retry: () => removeMember(memberUid),
    });
  // Leave right away; the delete finishes in the background. If it's
  // refused, say so (the trip is still there) and offer to try again.
  const deleteTrip = () => {
    const id = trip.id;
    const name = trip.name;
    navigate('/itinerary');
    deleteGroupTrip(id).catch((e) =>
      toast.show(friendlyError(e, `Couldn't delete ${name}. It's still there.`), {
        actionLabel: 'Retry',
        onAction: () => deleteGroupTrip(id).catch((err) => toast.show(friendlyError(err))),
      })
    );
  };

  return (
    <div>
      {back}
      <h1 className="screen-title">
        <span>{'\u{1F465}'}</span> {trip.name}
      </h1>
      <p className="screen-subtitle">{region?.name} — a trip you're building together</p>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Members</h3>
        {trip.memberUids.map((memberUid) => (
          <div key={memberUid} className="friend-row">
            <span>
              {trip.memberNames?.[memberUid] || 'A traveler'}
              {memberUid === trip.ownerUid ? ' (owner)' : ''}
            </span>
            {isOwner && memberUid !== trip.ownerUid && (
              <button className="btn btn-ghost btn-tight" onClick={() => removeMember(memberUid)}>
                Remove
              </button>
            )}
          </div>
        ))}
        {isOwner && friendsError && (
          <ErrorNotice
            error={friendsError}
            message={friendlyError(friendsError, "Couldn't load your friends to invite.")}
            onRetry={loadFriends}
            compact
          />
        )}
        {isOwner && invitable.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p className="screen-subtitle" style={{ marginTop: 0 }}>
              Add a friend:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {invitable.map((f) => (
                <button key={f.friend} type="button" className="btn btn-ghost btn-tight" onClick={() => addMember(f)}>
                  {'\u{2795}'} {f.friendName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>
            {'\u{1F5FA}\u{FE0F}'} Shared Landmarks ({selectedCount})
          </h3>
          {regionLandmarks.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!allSelected)}>
              {allSelected ? 'Clear all' : '\u{2705} Select all'}
            </button>
          )}
        </div>
        {(region?.landmarks || []).map((l) => {
          const selected = isSelected(l.id);
          return (
            <label key={l.id} className="friend-row" style={{ cursor: 'pointer' }}>
              <span>
                {selected ? '\u{2705}' : '\u{2B1C}'} {l.name}
              </span>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => setLandmark(l, !selected)}
                style={{ width: 20, height: 20 }}
              />
            </label>
          );
        })}
      </div>

      {isOwner && (
        <button type="button" className="btn btn-ghost btn-block" onClick={deleteTrip}>
          Delete This Group Trip
        </button>
      )}
    </div>
  );
}
