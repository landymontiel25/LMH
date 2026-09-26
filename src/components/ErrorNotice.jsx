import { friendlyError } from '../lib/friendlyError';

// The one way a screen shows "something failed": a plain-language message
// and a Try Again button. Pass `error` (anything friendlyError understands)
// or a ready-made `message`.
export default function ErrorNotice({ error, message, onRetry, retryLabel = 'Try again', compact = false }) {
  const text = message || friendlyError(error);
  return (
    <div className={`error-notice ${compact ? 'error-notice-compact' : ''}`} role="alert">
      <span className="error-notice-icon" aria-hidden="true">
        {'\u{26A0}\u{FE0F}'}
      </span>
      <p className="error-notice-text">{text}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-ghost error-notice-retry" onClick={onRetry}>
          {'\u{1F504}'} {retryLabel}
        </button>
      )}
    </div>
  );
}
