import { useEffect, useState } from 'react';

// navigator.onLine flips the instant the OS reports no network -- rough
// (it can't tell "no wifi" from "wifi but Firebase is down"), but it's
// exactly the signal that was missing: several read failures elsewhere are
// caught and treated as "no data," which looks identical to a real empty
// list. This at least tells a user "you're offline" instead of leaving
// them to wonder why everything looks empty.
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
