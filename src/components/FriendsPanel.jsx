import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { findUserByUsername, sendFriendRequest, acceptRequest, declineRequest, listFriends } from '../lib/friends';
import { listBlockedUsers, unblockUser } from '../lib/blocks';
import { getUserStats, getUserCheckins } from '../lib/leaderboard';
import { getRegion } from '../data/regions';
import CheckinsGallery from './CheckinsGallery';

export default function FriendsPanel() {
  const { user } = useAuth();
  const { requests, reload, myUsername, setUsername } = useFriends();
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [friends, setFriends] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [unameInput, setUnameInput] = useState('');
  const [unameBusy, setUnameBusy] = useState(false);
  const [unameMsg, setUnameMsg] = useState(null);
  // { uid, name, stats, recent, error, view: 'summary' | 'gallery' } | null
  const [friendStats, setFriendStats] = useState(null);

  const openFriendStats = async (f) => {
    setFriendStats({ uid: f.friend, name: f.friendName, loading: true, view: 'summary' });
    try {
      const [stats, checkins] = await Promise.all([getUserStats(f.friend), getUserCheckins(f.friend)]);
      setFriendStats({ uid: f.friend, name: f.friendName, loading: false, stats, recent: checkins[0] || null, view: 'summary' });
    } catch {
      setFriendStats({ uid: f.friend, name: f.friendName, loading: false, error: true, view: 'summary' });
    }
  };

  const loadFriends = async () => {
    try {
      setFriends(await listFriends(user.uid));
    } catch {
      /* rules not set yet */
    }
  };

  const loadBlocked = async () => {
    try {
      setBlocked(await listBlockedUsers(user.uid));
    } catch {
      /* rules not set yet */
    }
  };

  useEffect(() => {
    loadFriends();
    loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, requests.length, myUsername]);

  const handleUnblock = async (b) => {
    await unblockUser(user.uid, b.blockedUid);
    await loadBlocked();
  };

  // Pre-fill the box with your current username so you can see/edit it.
  useEffect(() => {
    if (myUsername) setUnameInput(myUsername);
  }, [myUsername]);

  const handleSetUsername = async () => {
    setUnameMsg(null);
    setUnameBusy(true);
    try {
      const u = await setUsername(unameInput);
      setUnameMsg(`Username set to @${u}.`);
      setUnameInput('');
    } catch (e) {
      setUnameMsg(e.message || 'Could not set username.');
    } finally {
      setUnameBusy(false);
    }
  };

  const handleAdd = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const found = await findUserByUsername(handle);
      if (!found) {
        setMsg('No user with that username.');
        return;
      }
      await sendFriendRequest(
        { uid: user.uid, username: myUsername, displayName: user.displayName, email: user.email },
        found
      );
      setMsg(`Friend request sent to @${found.username}.`);
      setHandle('');
    } catch (e) {
      setMsg(e.message || 'Could not send request.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (r) => {
    await acceptRequest(r);
    await reload();
    await loadFriends();
  };
  const handleDecline = async (r) => {
    await declineRequest(r);
    await reload();
  };

  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>{'\u{1F465}'} Friends</h3>

      {/* Username — always visible and editable (pre-filled with your current one) */}
      <div style={{ marginBottom: 16 }}>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          {myUsername ? (
            <>
              Your username is <strong>@{myUsername}</strong>. Change it below if you like.
            </>
          ) : (
            'Pick a username so friends can find you — no need to share your email.'
          )}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="friend-email-input"
            placeholder="username"
            value={unameInput}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            onChange={(e) => setUnameInput(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={unameBusy || !unameInput.trim() || unameInput.trim().toLowerCase() === (myUsername || '')}
            onClick={handleSetUsername}
          >
            {unameBusy ? '…' : myUsername ? 'Update' : 'Save'}
          </button>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--color-parchment-dim)', margin: '6px 0 0' }}>
          3–20 characters: lowercase letters, numbers, or _
        </p>
        {unameMsg && (
          <p className="screen-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
            {unameMsg}
          </p>
        )}
      </div>

      {/* Add friends — only once you have a username */}
      {myUsername && (
        <div>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            Add friends by their username.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="friend-email-input"
              placeholder="@username"
              value={handle}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              onChange={(e) => setHandle(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !handle} onClick={handleAdd}>
              Add
            </button>
          </div>
          {msg && (
            <p className="screen-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              {msg}
            </p>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 8px' }}>Requests</h4>
          {requests.map((r) => (
            <div key={r.id} className="friend-row">
              <span>@{r.fromName}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-tight" onClick={() => handleAccept(r)}>
                  Accept
                </button>
                <button className="btn btn-ghost btn-tight" onClick={() => handleDecline(r)}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h4 style={{ margin: '0 0 8px' }}>Your friends ({friends.length})</h4>
        {friends.length === 0 ? (
          <p className="screen-subtitle" style={{ margin: 0 }}>No friends yet.</p>
        ) : (
          friends.map((f) => (
            <div key={f.friend} className="friend-row" style={{ cursor: 'pointer' }} onClick={() => openFriendStats(f)}>
              <span style={{ fontWeight: 700 }}>@{f.friendName}</span>
              <span style={{ color: 'var(--color-parchment-dim)' }}>{'›'}</span>
            </div>
          ))
        )}
      </div>

      {blocked.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 8px' }}>Blocked ({blocked.length})</h4>
          {blocked.map((b) => (
            <div key={b.blockedUid} className="friend-row">
              <span>{b.blockedName || 'A user'}</span>
              <button className="btn btn-ghost btn-tight" onClick={() => handleUnblock(b)}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {friendStats && friendStats.view === 'gallery' && (
        <div className="modal-backdrop" onClick={() => setFriendStats(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 12 }}
              onClick={() => setFriendStats((cur) => ({ ...cur, view: 'summary' }))}
            >
              {'←'} Back
            </button>
            <CheckinsGallery
              user={{ uid: friendStats.uid }}
              claimedMap={{}}
              navigate={navigate}
              totalPoints={friendStats.stats?.totalPoints || 0}
              title={`@${friendStats.name}'s Check-ins`}
            />
            <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => setFriendStats(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {friendStats && friendStats.view === 'summary' && (
        <div className="modal-backdrop" onClick={() => setFriendStats(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {'\u{1F464}'} @{friendStats.name}
            </h3>
            {friendStats.loading && <p className="screen-subtitle">Loading…</p>}
            {friendStats.error && <p className="screen-subtitle">Could not load their stats — try again.</p>}
            {friendStats.stats && (
              <>
                <div className="profile-stats">
                  <div className="profile-stat">
                    <span className="profile-stat-num">{friendStats.stats.totalPoints.toLocaleString()}</span>
                    <span className="profile-stat-label">total pts</span>
                  </div>
                  <button
                    type="button"
                    className="profile-stat profile-stat-btn"
                    onClick={() => friendStats.stats.checkins && setFriendStats((cur) => ({ ...cur, view: 'gallery' }))}
                  >
                    <span className="profile-stat-num">{friendStats.stats.checkins.toLocaleString()}</span>
                    <span className="profile-stat-label">check-ins{friendStats.stats.checkins ? ' ›' : ''}</span>
                  </button>
                  <button
                    type="button"
                    className="profile-stat profile-stat-btn"
                    onClick={() => friendStats.stats.checkins && setFriendStats((cur) => ({ ...cur, view: 'gallery' }))}
                  >
                    <span className="profile-stat-num">{friendStats.stats.cities}</span>
                    <span className="profile-stat-label">cities{friendStats.stats.checkins ? ' ›' : ''}</span>
                  </button>
                </div>
                {friendStats.recent ? (
                  <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
                    Last check-in: <strong>{friendStats.recent.landmarkName || 'a landmark'}</strong>
                    {friendStats.recent.region ? ` — ${getRegion(friendStats.recent.region)?.name || ''}` : ''}
                  </p>
                ) : (
                  <p className="screen-subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
                    No check-ins yet.
                  </p>
                )}
              </>
            )}
            <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => setFriendStats(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
