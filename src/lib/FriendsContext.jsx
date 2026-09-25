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

// The very first profile read of a session can lose a race with Firebase
// Auth/Firestore still wiring up the ID token right after sign-in/app
// launch -- one transient failure there used to mean falling back to
// whatever was in localStorage (stale -- e.g. from before a taste baseline
// was ever saved) and then just staying on it until SOMETHING else
// happened to call reload() again (the taste editor's own close handler
// was the only thing that ever did), which is exactly why the Taste
// Profile card only ever "loaded in" after interacting with Edit instead
// of the moment the app opened. A couple of quick retries covers that
// startup race without needing any user interaction to recover.
const PROFILE_FETCH_RETRIES = 2;
async function fetchProfileWithRetry(uid) {
  for (let attempt = 0; attempt <= PROFILE_FETCH_RETRIES; attempt++) {
    try {
      const profile = await getUserProfile(uid);
      if (profile) return profile;
    } catch (e) {
      if (attempt === PROFILE_FETCH_RETRIES) throw e;
    }
    if (attempt < PROFILE_FETCH_RETRIES) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

export function FriendsProvider({ children }) {
  const { user } = useAuth();
  const [friendUids, setFriendUids] = useState(() => new Set());
  const [requests, setRequests] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  // True only once a REAL server read of this profile has landed this
  // session -- the instant cache pre-fill below is just for display (so a
  // username doesn't flash blank), and must never be mistaken for a
  // confirmed read of badgeEarnedAt. Trusting the cache there caused the
  // "same badge celebrates every login" bug: the cache can be stale
  // (missing a badge persisted since it was last written), which made
  // BadgesContext think an old badge was newly earned, over and over.
  const [profileFresh, setProfileFresh] = useState(false);

  const reload = useCallback(async () => {
    if (!firebaseEnabled || !user) {
      setFriendUids(new Set());
      setRequests([]);
      setMyProfile(null);
      setProfileFresh(false);
      return;
    }
    // Load each independently — one failing query must never hide the others
    // (a friends-rule hiccup should not wipe out your saved username), and
    // the profile lands the moment ITS read resolves rather than waiting
    // for the friends/requests queries too: on a cold start those all
    // compete with every other boot-time query, and the profile is what
    // the Taste Profile card (and the taste nudge) are sitting on.
    const profileDone = fetchProfileWithRetry(user.uid).then(
      (profile) => {
        if (profile) {
          setMyProfile(profile);
          cacheProfile(user.uid, profile);
          setProfileFresh(true);
          return;
        }
        // The doc genuinely doesn't exist yet -- only fall back to the
        // localStorage snapshot when there's nothing better in memory.
        setMyProfile((cur) => cur ?? loadCachedProfile(user.uid));
      },
      (err) => {
        // Read failed even after retrying. Logged (not just swallowed) so
        // a real read failure shows up somewhere instead of silently
        // serving stale cached data forever. Only ever fall back to the
        // localStorage snapshot when there's nothing better already in
        // memory (the very first load) -- a LATER hiccup must never regress
        // already-correct data back to an older cached copy that could be
        // missing something saved since (a taste baseline edit, say).
        console.error('[FriendsContext] getUserProfile failed on reload:', err);
        setMyProfile((cur) => cur ?? loadCachedProfile(user.uid));
      }
    );
    const [, f, r] = await Promise.allSettled([profileDone, listFriends(user.uid), listIncomingRequests(user.uid)]);
    if (f.status === 'fulfilled') setFriendUids(new Set((f.value || []).map((x) => x.friend)));
    if (r.status === 'fulfilled') setRequests(r.value || []);
  }, [user]);

  useEffect(() => {
    // Reset on every user change (including re-signing into the same
    // account) so the cache pre-fill below is never mistaken for this
    // session's confirmed read -- reload() below is what flips it back on.
    setProfileFresh(false);
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
      value={{
        friendUids,
        requests,
        myProfile,
        profileFresh,
        myUsername: myProfile?.username || null,
        setUsername,
        reload,
      }}
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
