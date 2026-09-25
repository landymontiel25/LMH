import { useOnlineStatus } from '../lib/useOnlineStatus';
import { WifiOff as WifiOffIcon } from 'lucide-react';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      style={{
        background: 'var(--color-error, #b3503f)',
        color: '#fff',
        textAlign: 'center',
        fontSize: '0.82rem',
        fontWeight: 600,
        padding: '8px 12px',
      }}
    >
      <WifiOffIcon aria-hidden="true" /> You're offline — some lists may look empty or out of date until you're back online.
    </div>
  );
}
