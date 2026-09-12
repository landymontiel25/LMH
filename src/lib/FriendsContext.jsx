import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { firebaseEnabled } from './firebase';
import { upsertUserProfile, listFriends, listIncomingRequests, getUserProfile, claimUsername } from './friends';
import { backfillUserName } from './leaderboard';

// Current user's profile (incl. username), friend set (for deciding whose photos
// you can see), and pending incoming requests. Upserts your profile on sign-in.
const FriendsContext = createContext(null);

// Cache the profile so your username is available instantly on launch and can't
// vanish (falling back to your email) if a profile read hiccups on cold start.
const PROFILE_CACHE = 'landmarkhunters.profile.v1';
function loadCachedProfile(uid) {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null');
    return p && p.uid === uid ? p : null;
  } catch {
    return null;
  }
}
function cacheProfile(uid, profile) {
  try {
    localStorage.setItem(PROFILE_CACHE, JSON.stringify({ uid, ...profile }));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function FriendsProvider({ children }) {
  const { user } = useAuth();
  const [friendUids, setFriendUids] = useState(() => new Set());
  const [requests, setRequests] = useState([]);
  const [myProfile, setMyProfile] = useState(null);

  const reload = useCallback(async () => {
    if (!firebaseEnabled || !user) {
      setFriendUids(new Set());
      setRequests([]);
      setMyProfile(null);
      return;
    }
    // Load each independently — one failing query must never hide the others
    // (a friends-rule hiccup should not wipe out your saved username).
    const [p, f, r] = await Promise.allSettled([
      getUserProfile(user.uid),
      listFriends(user.uid),
      listIncomingRequests(user.uid),
    ]);
    if (p.status === 'fulfilled' && p.value) {
      setMyProfile(p.value);
      cacheProfile(user.uid, p.value);
    } else {
      // Read failed or empty — fall back to the cached profile so the username
      // (and hero name) survive a flaky load. Logged (not just swallowed) so a
      // real read failure -- e.g. a permission error on a cold load -- shows
      // up somewhere instead of silently serving stale cached data forever.
      if (p.status === 'rejected') {
        console.error('[FriendsContext] getUserProfile failed on reload:', p.reason);
      }
      const cached = loadCachedProfile(user.uid);
      if (cached) setMyProfile(cached);
    }
    if (f.status === 'fulfilled') setFriendUids(new Set((f.value || []).map((x) => x.friend)));
    if (r.status === 'fulfilled') setRequests(r.value || []);
  }, [user]);

  useEffect(() => {
    if (firebaseEnabled && user) {
      // Show the cached username immediately, then refresh from the server.
      const cached = loadCachedProfile(user.uid);
      if (cached) setMyProfile(cached);
      upsertUserProfile(user).catch(() => {});
    }
    reload();
  }, [user, reload]);

  const setUsername = useCallback(
    async (name) => {
      const uname = await claimUsername(user, name);
      // Rewrite past check-ins / leaderboard rows so they show the username
      // (not an email or old handle). Non-fatal if it can't run.
      backfillUserName(user.uid, uname).catch(() => {});
      await reload();
      return uname;
    },
    [user, reload]
  );

  return (
    <FriendsContext.Provider
      value={{ friendUids, requests, myProfile, myUsername: myProfile?.username || null, setUsername, reload }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useFriends must be used inside FriendsProvider');
  return ctx;
}
