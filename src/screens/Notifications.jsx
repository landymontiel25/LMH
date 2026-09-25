import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { acceptRequest, declineRequest } from '../lib/friends';
import { subscribeMyNotifications, markNotificationRead } from '../lib/notifications';
import { ALL_LANDMARKS } from '../data/regions';
import { Bell as BellIcon, Megaphone as MegaphoneIcon, Ticket as TicketIcon, Users as UsersIcon } from 'lucide-react';

// Everything that can ask for your attention, in one place, grouped by what
// it actually is rather than one flat feed: friend requests (their own
// collection, not a `notifications` doc, since they carry Accept/Decline
// actions the generic feed doesn't model), group-trip invites, and
// whatever else lands in `notifications` going forward.
export default function Notifications() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { requests, reload: reloadFriends } = useFriends();
  const [items, setItems] = useState([]);
  const [busyRequestId, setBusyRequestId] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setItems([]);
      return;
    }
    return subscribeMyNotifications(user.uid, setItems);
  }, [firebaseEnabled, user]);

  const openItem = (n) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    if (n.groupTripId) {
      navigate(`/group/${n.groupTripId}`);
      return;
    }
    if (n.featureRequestId) {
      navigate('/request-feature', { state: { tab: 'review' } });
      return;
    }
    if (n.landmarkId) {
      const landmark = ALL_LANDMARKS.find((l) => l.id === n.landmarkId);
      if (landmark) navigate(`/landmarks/${landmark.regionId}/${landmark.id}`);
    }
  };

  const handleAccept = async (r) => {
    setBusyRequestId(r.id);
    try {
      await acceptRequest(r);
      await reloadFriends();
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleDecline = async (r) => {
    setBusyRequestId(r.id);
    try {
      await declineRequest(r);
      await reloadFriends();
    } finally {
      setBusyRequestId(null);
    }
  };

  const groupInvites = items.filter((n) => n.type === 'group_invite');
  const otherUpdates = items.filter((n) => n.type !== 'group_invite');
  const isEmpty = requests.length === 0 && groupInvites.length === 0 && otherUpdates.length === 0;

  return (
    <div>
      <h1 className="screen-title">
        <span><BellIcon aria-hidden="true" /></span> Notifications
      </h1>

      {isEmpty && (
        <p className="screen-subtitle">You're all caught up — nothing new right now.</p>
      )}

      {requests.length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><UsersIcon aria-hidden="true" /> Friend Requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="friend-row">
              <span>@{r.fromName}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-tight"
                  disabled={busyRequestId === r.id}
                  onClick={() => handleAccept(r)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  disabled={busyRequestId === r.id}
                  onClick={() => handleDecline(r)}
                >
                  Decline
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {groupInvites.length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><TicketIcon aria-hidden="true" /> Group Trip Invites</h3>
          {groupInvites.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => openItem(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openItem(n);
                }
              }}
              style={{
                padding: '10px 0',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                opacity: n.read ? 0.6 : 1,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {otherUpdates.length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><MegaphoneIcon aria-hidden="true" /> Other Updates</h3>
          {otherUpdates.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => openItem(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openItem(n);
                }
              }}
              style={{
                padding: '10px 0',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                opacity: n.read ? 0.6 : 1,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
