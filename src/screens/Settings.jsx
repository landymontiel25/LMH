import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useTheme } from '../lib/useTheme';
import { useUnits, countryName } from '../lib/UnitsContext';
import { setProfileVisibility, getUserProfile } from '../lib/friends';
import { useAdminMode } from '../lib/AdminModeContext';
import { findOrphanedRatings, mergeOrphanedRating } from '../lib/ratingMerge';
import PreferenceChips from '../components/PreferenceChips';

export default function Settings() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { myProfile, reload: reloadFriends } = useFriends();
  const { theme, toggleTheme } = useTheme();
  const { units, mode, setMode, autoCountry } = useUnits();
  const { adminMode, canUseAdminMode, setAdminMode } = useAdminMode();
  const [visBusy, setVisBusy] = useState(false);
  const [visMsg, setVisMsg] = useState(null);
  // Admin Mode -- "Fix Duplicate Ratings": a real check-in made before a
  // place had its own catalog entry (rated against a user-submitted
  // duplicate) gets re-filed under the real landmark once one exists.
  const [dupScanning, setDupScanning] = useState(false);
  const [dupCandidates, setDupCandidates] = useState(null);
  const [dupMerging, setDupMerging] = useState(null);
  const [dupError, setDupError] = useState('');

  const scanForDuplicates = async () => {
    setDupScanning(true);
    setDupError('');
    try {
      setDupCandidates(await findOrphanedRatings(user.uid));
    } catch (e) {
      setDupError(e.message || 'Could not scan — try again.');
    } finally {
      setDupScanning(false);
    }
  };

  const mergeDuplicate = async (candidate) => {
    setDupMerging(candidate.oldCheckin.id);
    setDupError('');
    try {
      await mergeOrphanedRating(candidate);
      setDupCandidates((cur) => cur?.filter((c) => c.oldCheckin.id !== candidate.oldCheckin.id) ?? null);
    } catch (e) {
      setDupError(e.message || 'Could not merge — try again.');
    } finally {
      setDupMerging(null);
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
        <span>{'\u{2699}\u{FE0F}'}</span> Settings
      </h1>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 24 }} onClick={() => navigate(-1)}>
        {'\u{2190}'} Back
      </button>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>{theme === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}'} Appearance</h3>
        <p className="screen-subtitle" style={{ marginTop: 0 }}>
          {theme === 'dark' ? 'Dark mode is on.' : 'Light mode is on.'}
        </p>
        <button type="button" className="btn btn-block btn-ghost" onClick={toggleTheme}>
          {theme === 'dark' ? `${'\u{2600}\u{FE0F}'} Switch to Light Mode` : `${'\u{1F319}'} Switch to Dark Mode`}
        </button>
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>{'\u{1F4CF}'} Units</h3>
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
        <h3 style={{ marginTop: 0 }}>{'⭐'} My Preferences</h3>
        <p className="screen-subtitle" style={{ marginTop: -6 }}>
          Save what you're usually into — Setup can fill it in for you with one tap.
        </p>
        <PreferenceChips />
      </div>

      {firebaseEnabled && user && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>{myProfile?.public ? '\u{1F30E}' : '\u{1F512}'} Privacy</h3>
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
              ? `${'\u{1F30E}'} Public — tap to make Private`
              : `${'\u{1F512}'} Private — tap to make Public`}
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
          <h3 style={{ marginTop: 0 }}>{'\u{1F6E0}\u{FE0F}'} Admin Mode</h3>
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
            {adminMode ? `${'\u{2715}'} Turn Off Admin Mode` : `${'\u{1F6E0}\u{FE0F}'} Turn On Admin Mode`}
          </button>
        </div>
      )}

      {canUseAdminMode && adminMode && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>{'\u{1F517}'} Fix Duplicate Ratings</h3>
          <p className="screen-subtitle" style={{ marginTop: 0 }}>
            Finds a real check-in you made against a place before it had its own catalog
            entry (a user-submitted duplicate pin) and re-files it under the real landmark
            — same rating, same photos, same checked-in date, just attached correctly.
          </p>
          <button type="button" className="btn btn-block btn-ghost" disabled={dupScanning} onClick={scanForDuplicates}>
            {dupScanning ? 'Scanning…' : dupCandidates ? 'Scan again' : `${'\u{1F50D}'} Scan for duplicate ratings`}
          </button>
          {dupError && (
            <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
              {dupError}
            </p>
          )}
          {dupCandidates && dupCandidates.length === 0 && (
            <p className="screen-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
              Nothing to fix — every check-in already points at a real landmark.
            </p>
          )}
          {dupCandidates && dupCandidates.length > 0 && (
            <ul className="checkin-stats" style={{ marginTop: 10 }}>
              {dupCandidates.map((c) => (
                <li key={c.oldCheckin.id} style={{ display: 'block' }}>
                  <div>
                    <strong>{c.oldCustomLandmark.name || c.oldCheckin.landmarkName}</strong> {'\u{2192}'}{' '}
                    {c.newLandmark.name}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 6 }}
                    disabled={dupMerging === c.oldCheckin.id}
                    onClick={() => mergeDuplicate(c)}
                  >
                    {dupMerging === c.oldCheckin.id ? 'Merging…' : 'Merge into real landmark'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
