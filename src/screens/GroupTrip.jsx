import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getRegion } from '../data/regions';
import { listFriends } from '../lib/friends';
import {
  subscribeGroupTrip,
  toggleGroupLandmark,
  addGroupMember,
  removeGroupMember,
  deleteGroupTrip,
} from '../lib/groupTrips';

// One trip a few friends build together (item i6) -- a single shared
// landmark list, live-updated for every member via subscribeGroupTrip.
export default function GroupTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [friends, setFriends] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeGroupTrip(tripId, setTrip);
    return unsub;
  }, [tripId]);

  useEffect(() => {
    if (user) listFriends(user.uid).then(setFriends).catch(() => setFriends([]));
  }, [user]);

  if (!trip) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/itinerary')}>
          {'← Back'}
        </button>
        <p className="empty-state">Loading, or you're not a member of this trip.</p>
      </div>
    );
  }

  const region = getRegion(trip.regionId);
  const isOwner = trip.ownerUid === user.uid;
  const invitable = friends.filter((f) => !trip.memberUids.includes(f.friend));

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/itinerary')}>
        {'← Itineraries'}
      </button>
      <h1 className="screen-title">
        <span>{'\u{1F465}'}</span> {trip.name}
      </h1>
      <p className="screen-subtitle">{region?.name} — a trip you're building together</p>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Members</h3>
        {trip.memberUids.map((uid) => (
          <div key={uid} className="friend-row">
            <span>
              {trip.memberNames?.[uid] || 'A traveler'}
              {uid === trip.ownerUid ? ' (owner)' : ''}
            </span>
            {isOwner && uid !== trip.ownerUid && (
              <button className="btn btn-ghost btn-tight" onClick={() => removeGroupMember(trip, uid)}>
                Remove
              </button>
            )}
          </div>
        ))}
        {isOwner && invitable.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p className="screen-subtitle" style={{ marginTop: 0 }}>
              Add a friend:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {invitable.map((f) => (
                <button
                  key={f.friend}
                  type="button"
                  className="btn btn-ghost btn-tight"
                  onClick={() => addGroupMember(trip, f.friend, f.friendName)}
                >
                  {'\u{2795}'} {f.friendName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>
          {'\u{1F5FA}\u{FE0F}'} Shared Landmarks ({trip.landmarkIds.length})
        </h3>
        {(region?.landmarks || []).map((l) => {
          const selected = trip.landmarkIds.includes(l.id);
          return (
            <label key={l.id} className="friend-row" style={{ cursor: 'pointer' }}>
              <span>
                {selected ? '\u{2705}' : '\u{2B1C}'} {l.name}
              </span>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleGroupLandmark(trip, l.id)}
                style={{ width: 20, height: 20 }}
              />
            </label>
          );
        })}
      </div>

      {isOwner && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await deleteGroupTrip(trip.id);
            navigate('/itinerary');
          }}
        >
          Delete This Group Trip
        </button>
      )}
    </div>
  );
}
