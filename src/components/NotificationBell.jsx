import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { subscribeMyNotifications, markNotificationRead } from '../lib/notifications';

// In-app notifications (item i2's non-push slice) -- see lib/notifications.js
// for why real push isn't wired up yet.
export default function NotificationBell() {
  const { user, firebaseEnabled } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setItems([]);
      return;
    }
    return subscribeMyNotifications(user.uid, setItems);
  }, [firebaseEnabled, user]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!firebaseEnabled || !user) return null;

  const unread = items.filter((n) => !n.read).length;

  const openItem = (n) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
  };

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ position: 'relative' }}
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
      >
        {'\u{1F514}'}
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 15,
              height: 15,
              borderRadius: 8,
              background: 'var(--color-error, #b3503f)',
              color: '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="points-popover" style={{ width: 260, maxHeight: 320, overflowY: 'auto' }}>
          {items.length === 0 && (
            <p className="screen-subtitle" style={{ margin: 0 }}>
              Nothing yet.
            </p>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => openItem(n)}
              style={{
                padding: '8px 0',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                opacity: n.read ? 0.6 : 1,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem' }}>{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
