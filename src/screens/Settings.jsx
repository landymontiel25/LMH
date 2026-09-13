import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { useTheme } from '../lib/useTheme';
import { useUnits } from '../lib/UnitsContext';
import { setProfileVisibility, getUserProfile } from '../lib/friends';

export default function Settings() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { myProfile, reload: reloadFriends } = useFriends();
  const { theme, toggleTheme } = useTheme();
  const { units, toggleUnits } = useUnits();
  const [visBusy, setVisBusy] = useState(false);
  const [visMsg, setVisMsg] = useState(null);

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
        </p>
        <button type="button" className="btn btn-block btn-ghost" onClick={toggleUnits}>
          {units === 'imperial' ? 'Switch to Metric (km)' : 'Switch to Imperial (mi)'}
        </button>
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
    </div>
  );
}
