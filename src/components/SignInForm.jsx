import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authErrorMessage } from '../lib/authErrors';

export default function SignInForm({ onSignedUp }) {
  const { signUpEmail, signInEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Self-certified age gate (item 3): not proof, but it's what puts a new
  // account outside COPPA's "actual knowledge" standard -- the checkbox
  // itself is `required` too, so a browser blocks submission before this
  // check ever runs for anyone who just left it unticked.
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setResetSent(false);
    if (mode === 'signup' && !ageConfirmed) {
      setError('You must confirm you’re 13 or older to create an account.');
      return;
    }
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === 'signup') {
        await signUpEmail(normalizedEmail, password, name);
        onSignedUp?.();
      } else {
        await signInEmail(normalizedEmail, password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
      setErrorCode(err?.code || '');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Type your email above first, then tap "Forgot password?"');
      return;
    }
    setError('');
    setErrorCode('');
    setResetSent(false);
    setBusy(true);
    try {
      await resetPassword(normalizedEmail);
      setResetSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
      setErrorCode(err?.code || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F6C2}'}</span> Sign In
      </h1>
      <p className="screen-subtitle">Sign in to check in, rate places, add friends, and hit the leaderboard.</p>

      <form onSubmit={handleEmailSubmit}>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="name">Display Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              title={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: 8,
                color: 'var(--color-parchment-dim)',
              }}
            >
              {showPassword ? '\u{1F648}' : '\u{1F441}\u{FE0F}'}
            </button>
          </div>
        </div>
        {resetSent && (
          <p className="tag tag-free" style={{ display: 'block', marginBottom: 14 }}>
            {'\u{1F4E7}'} If an account exists for that email, a password reset link is on its way — check your inbox
            (and spam folder).
          </p>
        )}
        {error && (
          <p className="tag tag-error" style={{ display: 'block', marginBottom: 14 }}>
            {error}
            {errorCode && <span style={{ opacity: 0.7 }}> ({errorCode})</span>}
          </p>
        )}
        {mode === 'signup' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: '0.78rem',
              color: 'var(--color-parchment-dim)',
              margin: '0 0 12px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              required
              style={{ marginTop: 2 }}
            />
            <span>I am 13 years of age or older.</span>
          </label>
        )}
        {mode === 'signup' && (
          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-parchment-dim)', margin: '0 0 10px' }}>
            By creating an account, you agree to our{' '}
            <Link to="/legal" style={{ color: 'var(--color-parchment-dim)' }}>
              Terms of Service & Privacy Policy
            </Link>
            .
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {mode === 'signup' ? 'Create Account' : 'Sign In'}
        </button>
      </form>

      {mode === 'signin' && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 12, background: 'none', border: 'none', textDecoration: 'underline' }}
          onClick={handleForgotPassword}
          disabled={busy}
        >
          Forgot password?
        </button>
      )}

      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 12 }}
        onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
      >
        {mode === 'signup' ? 'Already have an account? Sign In' : 'New here? Create an Account'}
      </button>

      <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.78rem' }}>
        <Link to="/legal" style={{ color: 'var(--color-parchment-dim)' }}>
          Privacy Policy & Terms of Service
        </Link>
      </p>
    </div>
  );
}
