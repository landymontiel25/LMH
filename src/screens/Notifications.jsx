import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { acceptRequest, declineRequest } from '../lib/friends';
import { subscribeMyNotifications, markNotificationRead } from '../lib/notifications';
import { ALL_LANDMARKS } from '../data/regions';
import { useToast, runOptimistic } from '../lib/ToastContext';
import { friendlyError } from '../lib/friendlyError';
import { SkeletonList } from '../components/Skeleton';
import ErrorNotice from '../components/ErrorNotice';

// Everything that can ask for your attention, in one place, grouped by what
// it actually is rather than one flat feed: friend requests (their own
// collection, not a `notifications` doc, since they carry Accept/Decline
// actions the generic feed doesn't model), group-trip invites, and
// whatever else lands in `notifications` going forward.
export default function Notifications() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { requests, reload: reloadFriends } = useFriends();
  const toast = useToast();
  const [items, setItems] = useState(null); // null = first snapshot not in yet
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Optimistic overlays on top of server data: requests you just answered
  // vanish immediately, notifications you just opened dim immediately. The
  // live listener / FriendsContext reload catch up behind them.
  const [answeredIds, setAnsweredIds] = useState(() => new Set());
  const [readIds, setReadIds] = useState(() => new Set());

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setItems([]);
      return;
    }
    setItems(null);
    setLoadError(null);
    return subscribeMyNotifications(
      user.uid,
      (rows) => {
        setLoadError(null);
        setItems(rows);
      },
      (err) => setLoadError(err)
    );
  }, [firebaseEnabled, user, loadAttempt]);

  const toggleIn = (setter, id, on) =>
    setter((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const markRead = (n) =>
    runOptimistic({
      apply: () => toggleIn(setReadIds, n.id, true),
      commit: () => markNotificationRead(n.id),
      rollback: () => toggleIn(setReadIds, n.id, false),
      toast,
      errorMessage: friendlyError(null, "Couldn't mark that notification as read."),
      retry: () => markRead(n),
    });

  const openItem = (n) => {
    if (!n.read && !readIds.has(n.id)) markRead(n);
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

  const answer = (r, accept) =>
    runOptimistic({
      apply: () => toggleIn(setAnsweredIds, r.id, true),
      commit: async () => {
        await (accept ? acceptRequest(r) : declineRequest(r));
        await reloadFriends();
      },
      rollback: () => toggleIn(setAnsweredIds, r.id, false),
      toast,
      errorMessage: friendlyError(
        null,
        accept ? `Couldn't accept @${r.fromName}'s request, so it's back.` : `Couldn't decline @${r.fromName}'s request, so it's back.`
      ),
      retry: () => answer(r, accept),
    });
  const handleAccept = (r) => answer(r, true);
  const handleDecline = (r) => answer(r, false);

  const visibleRequests = requests.filter((r) => !answeredIds.has(r.id));
  const loaded = items !== null;
  const shownItems = (items || []).map((n) => (readIds.has(n.id) ? { ...n, read: true } : n));
  const groupInvites = shownItems.filter((n) => n.type === 'group_invite');
  const otherUpdates = shownItems.filter((n) => n.type !== 'group_invite');
  // "All caught up" only once the feed actually loaded -- never as a stand-in
  // for "still loading" or "couldn't load".
  const isEmpty =
    loaded && !loadError && visibleRequests.length === 0 && groupInvites.length === 0 && otherUpdates.length === 0;

  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F514}'}</span> Notifications
      </h1>

      {loadError && (
        <ErrorNotice
          message={friendlyError(loadError, "We couldn't load your notifications. Try again.")}
          onRetry={() => setLoadAttempt((n) => n + 1)}
        />
      )}
      {!loaded && !loadError && <SkeletonList count={4} label="Loading notifications" />}

      {isEmpty && (
        <p className="screen-subtitle">You're all caught up — nothing new right now.</p>
      )}

      {visibleRequests.length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>{'\u{1F465}'} Friend Requests</h3>
          {visibleRequests.map((r) => (
            <div key={r.id} className="friend-row">
              <span>@{r.fromName}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-primary btn-tight" onClick={() => handleAccept(r)}>
                  Accept
                </button>
                <button type="button" className="btn btn-ghost btn-tight" onClick={() => handleDecline(r)}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {groupInvites.length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>{'\u{1F3AB}'} Group Trip Invites</h3>
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
          <h3 style={{ marginTop: 0 }}>{'\u{1F4E3}'} Other Updates</h3>
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
