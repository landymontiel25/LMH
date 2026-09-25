import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useTheme } from '../lib/useTheme';
import { useUnits, countryName } from '../lib/UnitsContext';
import { setProfileVisibility, getUserProfile, saveHomeLocation, saveTasteIntro, saveContextPreferences } from '../lib/friends';
import { useAdminMode } from '../lib/AdminModeContext';
import { authErrorMessage } from '../lib/authErrors';
import PreferenceChips from '../components/PreferenceChips';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { Calendar as CalendarIcon, CalendarDays as CalendarDaysIcon, CircleCheck as CircleCheckIcon, CircleX as CircleXIcon, Coffee as CoffeeIcon, Globe as GlobeIcon, House as HouseIcon, Lightbulb as LightbulbIcon, Lock as LockIcon, Moon as MoonIcon, PartyPopper as PartyPopperIcon, Puzzle as PuzzleIcon, Ruler as RulerIcon, Settings as SettingsIcon, Star as StarIcon, Sun as SunIcon, Wrench as WrenchIcon, X as XIcon, Zap as ZapIcon } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const { user, firebaseEnabled, signOutUser, resendVerification, refreshUser } = useAuth();
  const { myProfile, reload: reloadFriends } = useFriends();
  const { theme, toggleTheme } = useTheme();
  const { units, mode, setMode, autoCountry } = useUnits();
  const { adminMode, canUseAdminMode, setAdminMode } = useAdminMode();
  const [visBusy, setVisBusy] = useState(false);
  const [visMsg, setVisMsg] = useState(null);
  const [homeAddress, setHomeAddress] = useState(myProfile?.homeAddress || '');
  const [homeBusy, setHomeBusy] = useState(false);
  const [homeMsg, setHomeMsg] = useState(null);
  const [tasteIntro, setTasteIntro] = useState(myProfile?.tasteIntro || '');
  const [tasteBusy, setTasteBusy] = useState(false);
  const [tasteMsg, setTasteMsg] = useState(null);
  const [contextPrefs, setContextPrefs] = useState(() => ({
    weekday: myProfile?.contextPreferences?.weekday || '',
    weekend: myProfile?.contextPreferences?.weekend || '',
    chill: myProfile?.contextPreferences?.chill || '',
    active: myProfile?.contextPreferences?.active || '',
  }));
  const [contextBusy, setContextBusy] = useState(false);
  const [contextMsg, setContextMsg] = useState(null);
  // Tracks whether the traveler has touched a context-preference field yet
  // this visit -- same reasoning as tasteIntro's sync-in-once effect below:
  // myProfile loads asynchronously, so without this a field they've already
  // started typing into would get silently overwritten the moment the real
  // profile lands.
  const contextTouchedRef = useRef(false);
  const [verifyMsg, setVerifyMsg] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  // Catches "verified in another tab, then came back to Settings" without
  // requiring a full sign-out/sign-in.
  useEffect(() => {
    if (user && !user.emailVerified) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // myProfile loads asynchronously (FriendsContext), so the field would
  // otherwise start permanently blank whenever this screen mounts before
  // that first read lands -- sync it in once it does, but only if the user
  // hasn't already started typing over it.
  useEffect(() => {
    if (myProfile?.tasteIntro && !tasteIntro) setTasteIntro(myProfile.tasteIntro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile?.tasteIntro]);

  useEffect(() => {
    if (contextTouchedRef.current || !myProfile?.contextPreferences) return;
    setContextPrefs({
      weekday: myProfile.contextPreferences.weekday || '',
      weekend: myProfile.contextPreferences.weekend || '',
      chill: myProfile.contextPreferences.chill || '',
      active: myProfile.contextPreferences.active || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile?.contextPreferences]);

  const saveTaste = async () => {
    setTasteBusy(true);
    setTasteMsg(null);
    try {
      await saveTasteIntro(user.uid, tasteIntro);
      await reloadFriends();
      setTasteMsg('Saved.');
    } catch (e) {
      setTasteMsg(e.message || 'Could not save — try again.');
    } finally {
      setTasteBusy(false);
    }
  };

  const saveContext = async () => {
    setContextBusy(true);
    setContextMsg(null);
    try {
      await saveContextPreferences(user.uid, contextPrefs);
      await reloadFriends();
      setContextMsg('Saved.');
    } catch (e) {
      setContextMsg(e.message || 'Could not save — try again.');
    } finally {
      setContextBusy(false);
    }
  };

  const pickHome = async (s) => {
    setHomeAddress(s.primary);
    setHomeMsg(null);
    setHomeBusy(true);
    try {
      await saveHomeLocation(user.uid, { address: s.primary, lat: s.lat, lng: s.lng });
      await reloadFriends();
    } catch (e) {
      setHomeMsg(e.message || 'Could not save — try again.');
    } finally {
      setHomeBusy(false);
    }
  };

  const toggleVisibility = async () => {
    setVisBusy(true);
    setVisMsg(null);
    const next = !myProfile?.public;
    try {
      await setProfileVisibility(user.uid, next);
      // Read straight back from the server (not the cache) to confirm the
      // write actually stuck -- surfaces a rules/permission problem right
      // away instead of only discovering it on the next reload.
      const fresh = await getUserProfile(user.uid);
      if (!fresh || !!fresh.public !== next) {
        setVisMsg("That didn't save — try again.");
      }
      await reloadFriends();
    } catch (e) {
      setVisMsg(e.message || 'Could not update — try again.');
    } finally {
      setVisBusy(false);
    }
  };

  return (
    <div>
      <h1 className="screen-title">
        <span><SettingsIcon aria-hidden="true" /></span> Settings
      </h1>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 24 }} onClick={() => navigate(-1)}>
        {'\u{2190}'} Back
      </button>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>{theme === 'dark' ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />} Appearance</h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          {theme === 'dark' ? 'Dark mode is on.' : 'Light mode is on.'}
        </p>
        <button type="button" className="btn btn-block btn-ghost" onClick={toggleTheme}>
          {theme === 'dark' ? <><SunIcon aria-hidden="true" /> Switch to Light Mode</> : <><MoonIcon aria-hidden="true" /> Switch to Dark Mode</>}
        </button>
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}><RulerIcon aria-hidden="true" /> Units</h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          {units === 'imperial' ? 'Distances show in feet and miles.' : 'Distances show in meters and kilometers.'}
          {mode === 'auto' && (
            <>
              {' '}
              {autoCountry
                ? `Picked for ${countryName(autoCountry)}, where you are now.`
                : 'Picked from your device’s region until we have your location.'}
            </>
          )}
        </p>
        <div className="tabs" style={{ margin: 0 }}>
          <button type="button" className={`tab-btn ${mode === 'auto' ? 'active' : ''}`} onClick={() => setMode('auto')}>
            Automatic
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'imperial' ? 'active' : ''}`}
            onClick={() => setMode('imperial')}
          >
            Imperial (mi)
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'metric' ? 'active' : ''}`}
            onClick={() => setMode('metric')}
          >
            Metric (km)
          </button>
        </div>
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}><StarIcon aria-hidden="true" /> My Preferences</h3>
        <p className="screen-subtitle" style={{ marginTop: -6 }}>
          Save what you're usually into — Setup can fill it in for you with one tap.
        </p>
        <PreferenceChips />
      </div>

      {firebaseEnabled && user && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><PuzzleIcon aria-hidden="true" /> Tell Mapr What You Love</h3>
          <p className="screen-subtitle" style={{ marginTop: -6 }}>
            In your own words -- "I love racing, steak, pickleball, the boat... I like fancy, luxurious things." Mapr
            reads this directly, no rating required.
          </p>
          <textarea
            className="rating-comment"
            rows={3}
            maxLength={2000}
            placeholder="What are you already into?"
            value={tasteIntro}
            onChange={(e) => setTasteIntro(e.target.value)}
            disabled={tasteBusy}
          />
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 10 }}
            disabled={tasteBusy || !tasteIntro.trim()}
            onClick={saveTaste}
          >
            {tasteBusy ? 'Saving…' : 'Save'}
          </button>
          {tasteMsg && (
            <p className="screen-subtitle" style={{ marginTop: 8 }}>
              {tasteMsg}
            </p>
          )}
        </div>
      )}

      {firebaseEnabled && user && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><CalendarDaysIcon aria-hidden="true" /> Preferences by Situation</h3>
          <p className="screen-subtitle" style={{ marginTop: -6 }}>
            The taste above is your general baseline. This is for when it actually depends -- you might want a bar or
            a club on a Saturday night and nothing like that on a Tuesday. Fill in whichever apply; Mapr only uses
            the one that fits the moment (today's actual day, or the mood you're clearly asking for), never all of
            them at once.
          </p>
          {[
            { key: 'weekday', icon: <CalendarIcon aria-hidden="true" />, label: 'On weekdays', placeholder: 'e.g. "Quiet dinners, coffee shops, nothing too late"' },
            { key: 'weekend', icon: <PartyPopperIcon aria-hidden="true" />, label: 'On weekends', placeholder: 'e.g. "I\'m up for a bar or a club, later nights"' },
            { key: 'chill', icon: <CoffeeIcon aria-hidden="true" />, label: 'When I want something chill', placeholder: 'e.g. "A quiet walk, a museum, low-key cafes"' },
            { key: 'active', icon: <ZapIcon aria-hidden="true" />, label: 'When I want something active', placeholder: 'e.g. "Pickleball, hiking, anything with movement"' },
          ].map((f) => (
            <div key={f.key} className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`ctx-${f.key}`}>
                {f.icon} {f.label}
              </label>
              <textarea
                id={`ctx-${f.key}`}
                className="rating-comment"
                rows={2}
                maxLength={1000}
                placeholder={f.placeholder}
                value={contextPrefs[f.key]}
                onChange={(e) => {
                  contextTouchedRef.current = true;
                  setContextPrefs((cur) => ({ ...cur, [f.key]: e.target.value }));
                }}
                disabled={contextBusy}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 10 }}
            disabled={contextBusy}
            onClick={saveContext}
          >
            {contextBusy ? 'Saving…' : 'Save'}
          </button>
          {contextMsg && (
            <p className="screen-subtitle" style={{ marginTop: 8 }}>
              {contextMsg}
            </p>
          )}
        </div>
      )}

      {firebaseEnabled && user && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><HouseIcon aria-hidden="true" /> Home Address</h3>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            Helps Mapr learn your taste around where you actually live.
          </p>
          <LocationAutocomplete
            id="home-address"
            placeholder="Enter your home address"
            value={homeAddress}
            onChange={setHomeAddress}
            onSelect={pickHome}
          />
          {homeBusy && (
            <p className="screen-subtitle" style={{ marginTop: 8 }}>
              Saving…
            </p>
          )}
          {myProfile?.homeCoords && !homeBusy && (
            <p className="screen-subtitle" style={{ marginTop: 8 }}>
              Saved: {myProfile.homeAddress}
            </p>
          )}
          {homeMsg && (
            <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
              {homeMsg}
            </p>
          )}
        </div>
      )}

      {firebaseEnabled && user && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>{myProfile?.public ? <GlobeIcon aria-hidden="true" /> : <LockIcon aria-hidden="true" />} Privacy</h3>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            {myProfile?.public
              ? 'Your reviews and check-in photos are visible to everyone.'
              : 'Your reviews and check-in photos are only visible to friends.'}
          </p>
          <button
            type="button"
            className={`btn btn-block ${myProfile?.public ? 'btn-success' : 'btn-ghost'}`}
            disabled={visBusy}
            onClick={toggleVisibility}
          >
            {visBusy
              ? '…'
              : myProfile?.public
              ? <><GlobeIcon aria-hidden="true" /> Public — tap to make Private</>
              : <><LockIcon aria-hidden="true" /> Private — tap to make Public</>}
          </button>
          {visMsg && (
            <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
              {visMsg}
            </p>
          )}
        </div>
      )}

      {canUseAdminMode && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}><WrenchIcon aria-hidden="true" /> Admin Mode</h3>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            {adminMode
              ? 'On for this device. Editing/deleting a submitted landmark from its page or map pin changes it for everyone, immediately — there is no undo.'
              : 'Only visible to your account. Turn on to edit or delete any user-submitted landmark directly from its page or map pin.'}
          </p>
          <button
            type="button"
            className={`btn btn-block ${adminMode ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setAdminMode(!adminMode)}
          >
            {adminMode ? <><XIcon aria-hidden="true" /> Turn Off Admin Mode</> : <><WrenchIcon aria-hidden="true" /> Turn On Admin Mode</>}
          </button>
        </div>
      )}

      {/* Account -- moved here from Profile so that screen stays about your
          taste/ranks, not account admin. Always last on the page. */}
      {firebaseEnabled && user && (
        <div className="card section">
          <Link to="/request-feature" className="btn btn-ghost btn-block">
            <LightbulbIcon aria-hidden="true" /> Request a Feature
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
                  } catch (e) {
                    setVerifyMsg(`Could not send it right now: ${authErrorMessage(e)}`);
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
          <p style={{ textAlign: 'center', marginTop: 12, marginBottom: 0, fontSize: '0.78rem' }}>
            <Link to="/legal" style={{ color: 'var(--color-parchment-dim)' }}>
              Privacy Policy & Terms of Service
            </Link>
          </p>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={signOutUser}>
            Sign Out
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
          {/* Always visible (not just when unverified) -- so there's an
              unambiguous, no-digging-required answer to "is my email really
              verified or not," matching whatever refreshUser() last synced
              from Firebase's live account state. */}
          <p
            className={`tag ${user.emailVerified ? 'tag-free' : 'tag-error'}`}
            style={{ display: 'block', textAlign: 'center', marginTop: 12 }}
          >
            {user.emailVerified ? (
              <>
                <CircleCheckIcon aria-hidden="true" /> Your email has been verified.
              </>
            ) : (
              <>
                <CircleXIcon aria-hidden="true" /> Your email isn't verified yet.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
