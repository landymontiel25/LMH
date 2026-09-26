import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getRegion } from '../data/regions';
import {
  subscribeGroupTrip,
  toggleGroupLandmark,
  setGroupLandmarks,
  addGroupMember,
  removeGroupMember,
  deleteGroupTrip,
  renameGroupTrip,
  removeGroupPlace,
} from '../lib/groupTrips';
import AddMemberSheet from '../components/AddMemberSheet';
import EditableTitle from '../components/EditableTitle';
import DirectionsButton from '../components/DirectionsButton';
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
  const [showAdd, setShowAdd] = useState(false);
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
  const addMember = (m) =>
    runOptimistic({
      commit: () => addGroupMember(trip, m.uid, m.name).then(() => toast.show(`Added ${m.name} to ${trip.name}.`, { tone: 'success', durationMs: 3000 })),
      toast,
      errorMessage: `Couldn't add ${m.name || 'them'}. Try again.`,
      retry: () => addMember(m),
    });
  const rename = (name) =>
    runOptimistic({
      commit: () => renameGroupTrip(trip, name),
      toast,
      errorMessage: "Couldn't rename the trip. Try again.",
      retry: () => rename(name),
    });
  const removePlace = (place) =>
    runOptimistic({
      commit: () => removeGroupPlace(trip, place.id),
      toast,
      errorMessage: `Couldn't remove ${place.name}. Try again.`,
      retry: () => removePlace(place),
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
      <EditableTitle value={trip.name} onSave={rename} prefix={<span>{'\u{1F465}'}</span>} label="Rename group trip" />
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
        {/* Always the last row, under whoever joined most recently. */}
        <button type="button" className="member-add-row" onClick={() => setShowAdd(true)}>
          {'\u{2795}'} Add
        </button>
        {showAdd && (
          <AddMemberSheet
            title={`Add someone to ${trip.name}`}
            excludeUids={trip.memberUids}
            onPick={(m) => addMember(m)}
            onClose={() => setShowAdd(false)}
          />
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

      {(trip.places || []).length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>
            {'\u{1F310}'} Places From Mapr ({trip.places.length})
          </h3>
          {trip.places.map((p) => (
            <div key={p.id} className="friend-row" style={{ alignItems: 'flex-start' }}>
              <span style={{ minWidth: 0 }}>
                <strong>{p.name}</strong>
                {p.address && (
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.address}</span>
                )}
              </span>
              <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <DirectionsButton name={p.name} lat={p.lat} lng={p.lng} className="btn btn-ghost btn-tight">
                  {'\u{1F9ED}'}
                </DirectionsButton>
                <button type="button" className="btn btn-ghost btn-tight" aria-label={`Remove ${p.name}`} onClick={() => removePlace(p)}>
                  {'\u{1F5D1}\u{FE0F}'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <button type="button" className="btn btn-ghost btn-block" onClick={deleteTrip}>
          Delete This Group Trip
        </button>
      )}
    </div>
  );
}
