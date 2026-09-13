import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useTrip } from '../lib/TripContext';
import { subscribeLeaderboard, backfillUserName, cleanName } from '../lib/leaderboard';
import { authErrorMessage } from '../lib/authErrors';
import { getUserProfile } from '../lib/friends';
import { getRegion, INTERESTS } from '../data/regions';
import { classifyInterest } from '../lib/interestClassifier';
import { getPendingLandmarks, approveCustomLandmark, deleteCustomLandmark } from '../lib/customLandmarks';
import { useBadges } from '../lib/useBadges';
import { claimMyReferralBonuses, REFERRAL_BONUS_POINTS } from '../lib/referrals';
import { isAdmin } from '../lib/admins';
import FriendsPanel from '../components/FriendsPanel';
import SignInForm from '../components/SignInForm';
import AddInterestChip from '../components/AddInterestChip';
import LandmarkThumb from '../components/LandmarkThumb';
import FriendPopoverName from '../components/FriendPopoverName';
import NotificationBell from '../components/NotificationBell';

const PERIOD_LABEL = { weekly: 'This Week', monthly: 'This Month', yearly: 'This Year' };
const TABS = [
  { id: 'weekly', label: 'This Week' },
  { id: 'monthly', label: 'This Month' },
  { id: 'yearly', label: 'This Year' },
];
const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

// Shared "Sep 7, 2026, 10:04 AM" formatting for check-in / city-visit timestamps.
function fmtDateTime(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function InviteButton({ myUsername }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const handle = myUsername ? ` My username is @${myUsername} — add me and try to beat my score!` : '';
    const bonus = myUsername ? ` (we both get ${REFERRAL_BONUS_POINTS} bonus points once you sign up!)` : '';
    const text = `I'm hunting landmarks on Landmark Hunters 🏆 Come compete with me!${handle}${bonus}`;
    const url = myUsername ? `https://landmarkhunters.com/?ref=${myUsername}` : 'https://landmarkhunters.com';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Landmark Hunters', text, url });
        return;
      }
    } catch {
      /* user cancelled the share sheet — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — nothing else to do */
    }
  };
  return (
    <button className="btn btn-primary btn-block" onClick={share}>
      {copied ? '✓ Invite copied!' : '\u{1F465} Invite Friends to Compete'}
    </button>
  );
}

// The actual chip-grid for saved preferences -- shared by the "My
// Preferences" card below and the one-time onboarding step right after
// signup, so both stay in sync with the same trip.saved* fields.
function PreferenceChips() {
  const {
    trip,
    toggleSavedInterest,
    addSavedCustomInterest,
    removeSavedCustomInterest,
    toggleSavedCustomInterestSelected,
    setCustomInterestMatches,
    setCustomInterestEmoji,
  } = useTrip();
  const [classifying, setClassifying] = useState(() => new Set());

  const addCustom = (text) => {
    addSavedCustomInterest(text);
    setClassifying((cur) => new Set(cur).add(text));
    classifyInterest(text).then(({ matches, emoji }) => {
      setCustomInterestMatches(text, matches);
      setCustomInterestEmoji(text, emoji);
      setClassifying((cur) => {
        const next = new Set(cur);
        next.delete(text);
        return next;
      });
    });
  };

  return (
    <div className="chip-grid">
      {INTERESTS.map((i) => (
        <button
          key={i.id}
          type="button"
          className={`chip ${trip.savedInterests.includes(i.id) ? 'selected' : ''}`}
          onClick={() => toggleSavedInterest(i.id)}
        >
          <span className="chip-icon">{i.icon}</span>
          <span>{i.label}</span>
        </button>
      ))}
      {trip.savedCustomInterests.map((text) => {
        const isSelected = !trip.deselectedCustomInterests.includes(text);
        return (
          <div
            key={text}
            role="button"
            tabIndex={0}
            className={`chip ${isSelected ? 'selected' : ''}`}
            title={classifying.has(text) ? 'Finding matching landmarks…' : isSelected ? 'Tap to turn off' : 'Tap to turn on'}
            onClick={() => toggleSavedCustomInterestSelected(text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSavedCustomInterestSelected(text);
              }
            }}
          >
            <span className="chip-icon">
              {classifying.has(text) ? '\u{23F3}' : trip.customInterestEmoji[text] || '\u{2728}'}
            </span>
            <span>{text}</span>
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${text}`}
              onClick={(e) => {
                e.stopPropagation();
                removeSavedCustomInterest(text);
              }}
            >
              {'\u{1F5D1}\u{FE0F}'}
            </button>
          </div>
        );
      })}
      <AddInterestChip existing={trip.savedCustomInterests} onAdd={addCustom} />
    </div>
  );
}

// "My Preferences" — save your usual interests once here so Setup can fill
// them in with one tap instead of re-choosing them on every trip. Reuses the
// same chip UI as Setup's own interest picker, just writing to the trip's
// saved* fields instead of its live ones.
function PreferencesPanel() {
  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>{'⭐'} My Preferences</h3>
      <p className="screen-subtitle" style={{ marginTop: -6 }}>
        Save what you're usually into — Setup can fill it in for you with one tap.
      </p>
      <PreferenceChips />
    </div>
  );
}

// Shown once, right after creating an account -- gets your usual interests
// saved before you ever see Setup, so "Use My Preferences" already has
// something to apply on your very first trip.
function OnboardingPreferences({ onDone }) {
  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F389}'}</span> Welcome!
      </h1>
      <p className="screen-subtitle">
        What are you usually into? Save it now and Setup can fill it in for you on every trip from here on.
      </p>
      <PreferenceChips />
      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={onDone}>
        Continue {'\u{2192}'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onDone}>
        Skip for now
      </button>
    </div>
  );
}

// Admin-only review queue for landmarks submitted via "Add Landmark" -- they
// sit invisible to everyone else until approved or rejected here. Renders
// nothing at all for a non-admin account, and nothing once the queue is
// empty, so it never clutters Profile for anyone but the person doing the
// reviewing, and only when there's actually something to review.
function PendingLandmarksPanel({ email }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isAdmin(email)) return;
    getPendingLandmarks().then((l) => {
      setPending(l);
      setLoading(false);
    });
  }, [email]);

  if (!isAdmin(email) || loading || pending.length === 0) return null;

  const approve = async (docId) => {
    setBusyId(docId);
    try {
      const landmark = pending.find((l) => l.docId === docId);
      await approveCustomLandmark(docId, landmark);
      setPending((cur) => cur.filter((l) => l.docId !== docId));
    } catch {
      // leave it in the queue -- the admin can just try again
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (docId) => {
    setBusyId(docId);
    try {
      await deleteCustomLandmark(docId);
      setPending((cur) => cur.filter((l) => l.docId !== docId));
    } catch {
      // leave it in the queue -- the admin can just try again
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>{'\u{1F6E0}\u{FE0F}'} Pending Landmarks ({pending.length})</h3>
      <p className="screen-subtitle" style={{ marginTop: -6 }}>
        Submitted via "Add Landmark" — invisible to everyone until you approve one.
      </p>
      {pending.map((l) => (
        <div key={l.docId} className="checkin-row" style={{ alignItems: 'flex-start', cursor: 'default' }}>
          <LandmarkThumb landmark={l} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="checkin-name">{l.name}</div>
            <div className="checkin-sub" style={{ whiteSpace: 'normal' }}>
              {l.summary}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-success btn-tight"
                disabled={busyId === l.docId}
                onClick={() => approve(l.docId)}
              >
                {'\u{2713}'} Approve
              </button>
              <button
                type="button"
                className="btn btn-danger btn-tight"
                disabled={busyId === l.docId}
                onClick={() => reject(l.docId)}
              >
                {'\u{2715}'} Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const { user, firebaseEnabled, signOutUser, deleteAccount, resendVerification, refreshUser } = useAuth();
  const [verifyMsg, setVerifyMsg] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  // Catches "verified in another tab, then came back to Profile" without
  // requiring a full sign-out/sign-in.
  useEffect(() => {
    if (user && !user.emailVerified) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { myUsername } = useFriends();
  const navigate = useNavigate();
  const { stats, streakDays, badges } = useBadges();
  const [tab, setTab] = useState('weekly'); // weekly | monthly | yearly
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCities, setShowCities] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const healedRef = useRef(false);
  // Which badge's description popover is open -- hover (desktop, with the
  // same short grace period as the header's profile popover) or tap
  // (mobile) both toggle it, same pattern as FriendPopoverName.
  const [openBadgeId, setOpenBadgeId] = useState(null);
  const badgesRef = useRef(null);
  const closeBadgeTimer = useRef(null);
  const openBadgeNow = (id) => {
    clearTimeout(closeBadgeTimer.current);
    setOpenBadgeId(id);
  };
  const closeBadgeSoon = () => {
    closeBadgeTimer.current = setTimeout(() => setOpenBadgeId(null), 250);
  };
  useEffect(() => () => clearTimeout(closeBadgeTimer.current), []);
  useEffect(() => {
    function handleClickOutside(e) {
      if (badgesRef.current && !badgesRef.current.contains(e.target)) setOpenBadgeId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const period = tab; // the board always tracks a period

  // Referral bonuses (item i8) -- claims anything owed (as the referred
  // user, and/or as a referrer whose link brought in a new signup) once
  // per Profile visit, then reads the resulting total back.
  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setBonusPoints(0);
      return;
    }
    let cancelled = false;
    claimMyReferralBonuses(user.uid)
      .then(() => getUserProfile(user.uid))
      .then((profile) => {
        if (!cancelled) setBonusPoints(profile?.bonusPoints || 0);
      })
      .catch(() => {
        if (!cancelled) setBonusPoints(0);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, user]);

  // Self-heal: if your board row still shows an email/old name, rewrite it.
  useEffect(() => {
    if (healedRef.current || !user || !myUsername) return;
    const mine = entries.find((e) => e.userId === user.uid);
    if (mine && mine.userName !== myUsername) {
      healedRef.current = true;
      backfillUserName(user.uid, myUsername).catch(() => {});
    }
  }, [entries, myUsername, user]);

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeLeaderboard(period, (data) => {
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, [period, firebaseEnabled]);

  if (!firebaseEnabled) {
    return (
      <div className="empty-state">
        <p>Profiles &amp; leaderboard aren't configured yet.</p>
        <p>
          Add your Firebase project keys to a <code>.env</code> file — see the README.
        </p>
      </div>
    );
  }

  if (!user) return <SignInForm onSignedUp={() => setJustSignedUp(true)} />;

  if (justSignedUp) return <OnboardingPreferences onDone={() => setJustSignedUp(false)} />;

  const myIdx = entries.findIndex((e) => e.userId === user.uid);
  const myPoints = myIdx >= 0 ? entries[myIdx].points : 0;
  const myRank = myIdx >= 0 ? myIdx + 1 : null;

  const displayFor = (e) => (e.userId === user.uid && myUsername ? myUsername : cleanName(e.userName));

  let motivator;
  if (myIdx < 0) {
    motivator = 'Check in at a landmark to get on the board! 🚀';
  } else if (myIdx === 0) {
    motivator = "👑 You're #1 — don't let anyone catch you!";
  } else {
    const above = entries[myIdx - 1];
    const gap = above.points - myPoints;
    motivator = `${gap.toLocaleString()} pts behind ${cleanName(above.userName)} 🔥`;
  }

  const top3 = entries.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd · 1st · 3rd
  const rest = entries.slice(3);
  const myRowOutside = myIdx >= 3;

  return (
    <div>
      <PendingLandmarksPanel email={user.email} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="screen-title">
          <span>{'\u{1F3C6}'}</span> Ranks
        </h1>
        <NotificationBell />
      </div>

      {/* 1 — Your hero card */}
      <div className="card section rank-hero">
        <div className="rank-hero-top">
          <div className="rank-hero-rank">{myRank ? `#${myRank}` : '—'}</div>
          <div className="rank-hero-meta">
            <div className="rank-hero-name">{myUsername ? `@${myUsername}` : user.displayName || 'Explorer'}</div>
            <div className="rank-hero-pts">
              {myPoints.toLocaleString()} <span>pts {PERIOD_LABEL[period].toLowerCase()}</span>
            </div>
          </div>
        </div>
        <div className="rank-hero-motivator">{motivator}</div>
        <div className="tabs" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2 — Leaderboard */}
      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>{'\u{1F3C6}'} Leaderboard</h3>
          {!loading && entries.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              onClick={() => navigate(`/leaderboard/full?period=${period}`)}
            >
              See Full List
            </button>
          )}
        </div>
        {loading && <p className="screen-subtitle">Loading rankings…</p>}
        {!loading && entries.length === 0 && (
          <div className="empty-state">
            <p>No points yet {PERIOD_LABEL[period].toLowerCase()} — check in to be first!</p>
          </div>
        )}

        {!loading && top3.length > 0 && (
          <div className="podium">
            {podiumOrder.map((e, i) =>
              e ? (
                <div
                  key={e.id}
                  className={`podium-slot podium-${i === 1 ? 'first' : i === 0 ? 'second' : 'third'} ${
                    e.userId === user.uid ? 'me' : ''
                  }`}
                >
                  <div className="podium-medal">{MEDAL[i === 1 ? 0 : i === 0 ? 1 : 2]}</div>
                  <div className="podium-name">
                    <FriendPopoverName userId={e.userId} fallbackName={displayFor(e)}>
                      {displayFor(e)}
                    </FriendPopoverName>
                  </div>
                  <div className="podium-pts">{e.points.toLocaleString()}</div>
                </div>
              ) : (
                <div key={`empty-${i}`} className="podium-slot podium-empty" />
              )
            )}
          </div>
        )}

        {rest.map((e, idx) => (
          <div key={e.id} className={`leaderboard-row ${e.userId === user.uid ? 'me' : ''}`}>
            <div className="leaderboard-rank">#{idx + 4}</div>
            <div style={{ flex: 1 }}>
              <FriendPopoverName userId={e.userId} fallbackName={displayFor(e)}>
                {displayFor(e)}
              </FriendPopoverName>
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-brass-bright)', fontWeight: 700 }}>
              {e.points.toLocaleString()} pts
            </div>
          </div>
        ))}

        {myRowOutside && (
          <div className="leaderboard-row me" style={{ marginTop: 8 }}>
            <div className="leaderboard-rank">#{myRank}</div>
            <div style={{ flex: 1 }}>{myUsername ? `@${myUsername}` : 'You'}</div>
            <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-brass-bright)', fontWeight: 700 }}>
              {myPoints.toLocaleString()} pts
            </div>
          </div>
        )}
      </div>

      {/* 3 — Friends & invite */}
      <div className="section">
        <InviteButton myUsername={myUsername} />
      </div>
      <FriendsPanel />

      {/* 4 — Your stats */}
      <div className="card section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>{'\u{1F4CA}'} Your Stats</h3>
          <button type="button" className="btn btn-ghost btn-tight" onClick={() => navigate('/stats')}>
            See Full Stats ›
          </button>
        </div>
        <div className="profile-stats">
          <button
            type="button"
            className="profile-stat profile-stat-btn"
            onClick={() => stats?.checkins && navigate('/stats')}
          >
            <span className="profile-stat-num">{stats ? stats.checkins.toLocaleString() : '…'}</span>
            <span className="profile-stat-label">check-ins{stats?.checkins ? ' ›' : ''}</span>
          </button>
          <button
            type="button"
            className="profile-stat profile-stat-btn"
            onClick={() => stats?.cityIds?.length && setShowCities(true)}
          >
            <span className="profile-stat-num">{stats ? stats.cities : '…'}</span>
            <span className="profile-stat-label">cities{stats?.cityIds?.length ? ' ›' : ''}</span>
          </button>
          <div className="profile-stat">
            <span className="profile-stat-num">{streakDays}{streakDays > 0 ? ' \u{1F525}' : ''}</span>
            <span className="profile-stat-label">day streak</span>
          </div>
        </div>

        {bonusPoints > 0 && (
          <p className="tag" style={{ marginTop: 14 }}>
            {'\u{1F381}'} {bonusPoints.toLocaleString()} referral bonus points
          </p>
        )}

        {badges.length > 0 && (
          <div ref={badgesRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {badges.map((b) => (
              <span
                key={b.id}
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={() => openBadgeNow(b.id)}
                onMouseLeave={closeBadgeSoon}
              >
                <button
                  type="button"
                  className="tag"
                  style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
                  onClick={() => setOpenBadgeId((cur) => (cur === b.id ? null : b.id))}
                >
                  {b.icon} {b.label}
                </button>
                {openBadgeId === b.id && (
                  <div className="points-popover" style={{ right: 'auto', left: 0, whiteSpace: 'normal', width: 160, fontWeight: 400 }}>
                    {b.description}
                  </div>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 4.5 — My Preferences */}
      <PreferencesPanel />

      {/* 5 — Account */}
      <div className="card section">
        <p className="screen-subtitle" style={{ margin: 0 }}>
          Signed in as {myUsername ? `@${myUsername}` : user.displayName || user.email}
        </p>
        <Link to="/settings" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>
          {'\u{2699}\u{FE0F}'} Settings
        </Link>
        {!user.emailVerified && (
          <div style={{ marginTop: 12 }}>
            <p className="tag tag-error" style={{ display: 'block', margin: 0 }}>
              Your email isn't verified yet — some actions (like adding a landmark) need it.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              disabled={verifyBusy}
              onClick={async () => {
                setVerifyBusy(true);
                setVerifyMsg(null);
                try {
                  await resendVerification();
                  setVerifyMsg('Verification email sent — check your inbox (and spam folder).');
                } catch {
                  setVerifyMsg('Could not send it right now — try again in a bit.');
                } finally {
                  setVerifyBusy(false);
                }
              }}
            >
              {verifyBusy ? 'Sending…' : 'Resend Verification Email'}
            </button>
            {verifyMsg && (
              <p className="screen-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                {verifyMsg}
              </p>
            )}
          </div>
        )}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={signOutUser}>
          Sign Out
        </button>
        <p style={{ textAlign: 'center', marginTop: 12, marginBottom: 0, fontSize: '0.78rem' }}>
          <Link to="/legal" style={{ color: 'var(--color-parchment-dim)' }}>
            Privacy Policy & Terms of Service
          </Link>
        </p>
        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8, color: 'var(--color-error, #b3503f)' }}
          onClick={() => {
            setDeleteError('');
            setDeletePassword('');
            setShowDeleteAccount(true);
          }}
        >
          Delete Account
        </button>
        {user.metadata?.creationTime && (
          <p style={{ textAlign: 'center', marginTop: 12, marginBottom: 0, fontSize: '0.72rem', color: 'var(--color-parchment-dim)' }}>
            Joined{' '}
            {new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {showDeleteAccount && (
        <div className="modal-backdrop" onClick={() => !deleteBusy && setShowDeleteAccount(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Delete your account?</h3>
            <p className="screen-subtitle">
              This permanently removes your sign-in, profile, reviews, and friend connections. Check-ins stay on the
              leaderboard for scoring integrity but are stripped of your name and photo. This can't be undone.
            </p>
            <input
              type="password"
              className="friend-email-input"
              placeholder="Confirm your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            />
            {deleteError && (
              <p className="tag tag-error" style={{ display: 'block', marginBottom: 10 }}>
                {deleteError}
              </p>
            )}
            <button
              className="btn btn-block"
              style={{ background: 'var(--color-error, #b3503f)', color: '#fff' }}
              disabled={deleteBusy || !deletePassword}
              onClick={async () => {
                setDeleteBusy(true);
                setDeleteError('');
                try {
                  await deleteAccount(deletePassword);
                  navigate('/');
                } catch (e) {
                  setDeleteError(authErrorMessage(e));
                  setDeleteBusy(false);
                }
              }}
            >
              {deleteBusy ? 'Deleting…' : 'Permanently Delete My Account'}
            </button>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 8 }}
              disabled={deleteBusy}
              onClick={() => setShowDeleteAccount(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCities && (
        <div className="modal-backdrop" onClick={() => setShowCities(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{'\u{1F3D9}\u{FE0F}'} Cities you've visited</h3>
            {(stats?.cityIds || []).map((id) => {
              const r = getRegion(id);
              return (
                <div
                  key={id}
                  className="checkin-row"
                  onClick={() => {
                    setShowCities(false);
                    navigate('/landmarks');
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div className="checkin-name">{r?.name || id}</div>
                    <div className="checkin-sub">
                      {r?.country}
                      {r?.country && stats?.cityLastVisit?.[id] ? ' · ' : ''}
                      {fmtDateTime(stats?.cityLastVisit?.[id])}
                    </div>
                  </div>
                  <div className="checkin-pts">{'\u{2192}'}</div>
                </div>
              );
            })}
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setShowCities(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
