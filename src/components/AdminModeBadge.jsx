import { useNavigate } from 'react-router-dom';
import { useAdminMode } from '../lib/AdminModeContext';

// A constant, impossible-to-miss reminder that Admin Mode is on -- every
// screen, not just Settings/landmark pages, since it's easy to forget you
// left it on and then be confused why editing a landmark's page looks
// different. Tapping it turns Admin Mode off right there, no trip back to
// Settings needed; it simply isn't rendered at all once Admin Mode is off.
export default function AdminModeBadge() {
  const navigate = useNavigate();
  const { adminMode, setAdminMode } = useAdminMode();

  if (!adminMode) return null;

  return (
    <button
      type="button"
      className="admin-mode-badge"
      title="Admin Mode is on — tap to turn it off"
      onClick={() => setAdminMode(false)}
      onContextMenu={(e) => {
        // Long-press-ish escape hatch to Settings, in case someone wants the
        // full toggle/explanation there instead of an instant off.
        e.preventDefault();
        navigate('/settings');
      }}
    >
      <span className="admin-mode-badge-star" aria-hidden="true">
        {'★'}
      </span>
      Admin Mode On
    </button>
  );
}
