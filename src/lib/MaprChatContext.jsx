import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const MaprChatContext = createContext(null);

export const MAPR_GREETING =
  "Hey — I'm Mapr. Tell me what you're up for: a vibe, a time budget, an interest, whatever. I'll line up real stops.";

const initialMessages = () => [{ role: 'assistant', text: MAPR_GREETING, stops: [] }];

// Mapr's live chat thread, city picks, and whether the trip-planner card is
// open all used to live as local useState in Mapr.jsx -- but Mapr.jsx
// unmounts like any other route the moment you tap over to another tab, so
// stepping away mid-conversation to check a landmark and coming back wiped
// the whole thread back to the opening greeting. This Provider sits above
// the router in App.jsx instead, so it survives leaving and returning to
// Mapr; only signing into a different account resets it, so a fresh
// traveler on a shared device never sees someone else's half-built trip.
export function MaprChatProvider({ children }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [regions, setRegions] = useState([]);
  const [showPlanner, setShowPlanner] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  // Also shared, not local to Mapr.jsx -- a reply still in flight when you
  // tap away keeps resolving in the background (setMessages below is this
  // same shared setter either way), so the typing indicator and disabled
  // composer should track that correctly if you come back mid-reply,
  // instead of a freshly-mounted Mapr.jsx assuming nothing's happening.
  const [busy, setBusy] = useState(false);
  // Ref, not state -- this only needs to compare "did the signed-in
  // account actually change" on each render, it never needs to trigger one
  // itself.
  const uidRef = useRef(user?.uid ?? null);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (uidRef.current === uid) return;
    uidRef.current = uid;
    setMessages(initialMessages());
    setDraft('');
    setRegions([]);
    setShowPlanner(false);
    setTotalCost(0);
    setBusy(false);
  }, [user?.uid]);

  return (
    <MaprChatContext.Provider
      value={{
        messages,
        setMessages,
        draft,
        setDraft,
        regions,
        setRegions,
        showPlanner,
        setShowPlanner,
        totalCost,
        setTotalCost,
        busy,
        setBusy,
      }}
    >
      {children}
    </MaprChatContext.Provider>
  );
}

export function useMaprChat() {
  const ctx = useContext(MaprChatContext);
  if (!ctx) throw new Error('useMaprChat must be used inside MaprChatProvider');
  return ctx;
}
