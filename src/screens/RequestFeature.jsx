import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../lib/FriendsContext';
import { isAdmin } from '../lib/admins';
import {
  submitFeatureRequest,
  getPendingFeatureRequests,
  approveFeatureRequest,
  rejectFeatureRequest,
} from '../lib/featureRequests';
import { Check as CheckIcon, Lightbulb as LightbulbIcon, PartyPopper as PartyPopperIcon, X as XIcon } from 'lucide-react';

// Admin-only: the live queue of everything sitting in "pending", with
// Approve/Reject buttons -- same shape as Profile's PendingLandmarksPanel.
// firestore.rules is what actually enforces "only an admin can flip
// status" -- this tab just wouldn't be reachable for anyone else anyway.
function ReviewPanel() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    getPendingFeatureRequests().then((r) => {
      setPending(r);
      setLoading(false);
    });
  }, []);

  const approve = async (id) => {
    setBusyId(id);
    try {
      await approveFeatureRequest(id);
      setPending((cur) => cur.filter((r) => r.id !== id));
    } catch {
      // leave it in the queue -- try again
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    setBusyId(id);
    try {
      await rejectFeatureRequest(id);
      setPending((cur) => cur.filter((r) => r.id !== id));
    } catch {
      // leave it in the queue -- try again
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="screen-subtitle" style={{ textAlign: 'center', marginTop: 20 }}>Loading…</p>;
  }
  if (pending.length === 0) {
    return <p className="screen-subtitle" style={{ textAlign: 'center', marginTop: 20 }}>Nothing pending — all caught up.</p>;
  }

  return (
    <div>
      {pending.map((r) => (
        <div key={r.id} className="card section">
          <h3 style={{ marginTop: 0 }}>{r.title}</h3>
          <p className="screen-subtitle" style={{ marginTop: -6 }}>Requested by {r.userName}</p>
          <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{r.description}</p>
          {r.reason && (
            <p className="screen-subtitle" style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>
              <strong>Why: </strong>
              {r.reason}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-success btn-tight"
              disabled={busyId === r.id}
              onClick={() => approve(r.id)}
            >
              <CheckIcon aria-hidden="true" /> Approve
            </button>
            <button
              type="button"
              className="btn btn-danger btn-tight"
              disabled={busyId === r.id}
              onClick={() => reject(r.id)}
            >
              <XIcon aria-hidden="true" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// The form everyone sees: name, description, and why -- exactly what gets
// read (and, once approved, considered) on the other side.
function RequestForm({ user, myUsername, onSubmitted }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = title.trim() && description.trim() && reason.trim();

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    try {
      await submitFeatureRequest({
        userId: user.uid,
        userName: myUsername || user.displayName || user.email || 'Explorer',
        title,
        description,
        reason,
      });
      setTitle('');
      setDescription('');
      setReason('');
      onSubmitted();
    } catch (e) {
      setError(e.message || 'Could not submit — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="screen-subtitle">
        Want a new feature? Request one here! We read every single request so don't be shy!
      </p>

      <div className="field">
        <label>Feature name</label>
        <input
          type="text"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Dark mode for the map"
        />
      </div>

      <div className="field">
        <label>Explanation / description</label>
        <textarea
          rows={3}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What should it do?"
        />
      </div>

      <div className="field">
        <label>Why add this feature?</label>
        <textarea
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What problem does it solve, or why would it help?"
        />
      </div>

      <button type="button" className="btn btn-primary btn-block" disabled={!canSubmit || saving} onClick={submit}>
        {saving ? 'Sending…' : 'Submit Request'}
      </button>
      {error && (
        <p className="tag tag-error" style={{ display: 'block', marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function RequestFeature() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, firebaseEnabled } = useAuth();
  const { myUsername } = useFriends();
  const admin = isAdmin(user?.email);
  // A tap on the "new feature request" notification lands the admin
  // straight on the review tab instead of the form.
  const [tab, setTab] = useState(admin && location.state?.tab === 'review' ? 'review' : 'request');
  const [justSubmitted, setJustSubmitted] = useState(false);

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        {'← Back'}
      </button>

      <h1 className="screen-title">
        <span><LightbulbIcon aria-hidden="true" /></span> Request a Feature
      </h1>

      {admin && (
        <div className="tabs" style={{ margin: '0 0 16px' }}>
          <button type="button" className={`tab-btn ${tab === 'request' ? 'active' : ''}`} onClick={() => setTab('request')}>
            Request a Feature
          </button>
          <button type="button" className={`tab-btn ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            Approve/Reject Features
          </button>
        </div>
      )}

      {!firebaseEnabled ? (
        <p className="screen-subtitle">Accounts aren't set up yet.</p>
      ) : !user ? (
        <p className="screen-subtitle">Sign in first (Profile tab) to request a feature.</p>
      ) : tab === 'review' ? (
        <ReviewPanel />
      ) : justSubmitted ? (
        <div className="card section" style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}><PartyPopperIcon aria-hidden="true" /> Thanks!</h3>
          <p className="screen-subtitle" style={{ margin: 0 }}>Your request is in — we read every one.</p>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setJustSubmitted(false)}>
            Submit another
          </button>
        </div>
      ) : (
        <RequestForm user={user} myUsername={myUsername} onSubmitted={() => setJustSubmitted(true)} />
      )}
    </div>
  );
}
