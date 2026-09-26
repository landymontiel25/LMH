import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { getRegion } from '../data/regions';
import { clearPersisted, readPersisted, writePersisted } from './usePersistentState';

const MaprChatContext = createContext(null);

export const MAPR_GREETING =
  "Hey — I'm Mapr. Tell me what you're up for: a vibe, a time budget, an interest, whatever. I'll line up real stops.";

// Shown in place of a reply that never came back because the app was closed
// (or reloaded) while it was still in flight -- the saved thread ends on the
// traveler's own message, so offer to resend it instead of leaving it
// hanging with no answer.
const INTERRUPTED_REPLY = "That reply didn't finish before the app closed. Want me to try again?";

const initialMessages = () => [{ role: 'assistant', text: MAPR_GREETING, stops: [] }];

// Enough to pick a conversation back up, small enough that a long thread
// with stop lists can't crowd out everything else in localStorage.
const MAX_STORED_MESSAGES = 40;
// Chats are about "what am I doing this week", not forever.
const CHAT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const storageKey = (uid) => `mapr.chat.${uid}`;

const freshChat = (uid) => ({ uid, messages: initialMessages(), draft: '', regionIds: [], showPlanner: false, restored: false });

// Signed-out chats aren't saved: the AI needs an account anyway, and a
// shared device shouldn't carry an anonymous thread into the next session.
function loadChat(uid) {
  if (!uid) return freshChat(uid);
  const saved = readPersisted(storageKey(uid), CHAT_TTL_MS);
  if (!saved || !Array.isArray(saved.messages) || !saved.messages.length) return freshChat(uid);
  let messages = saved.messages;
  const last = messages.at(-1);
  if (last?.role === 'user') {
    messages = [...messages, { role: 'assistant', text: INTERRUPTED_REPLY, stops: [], error: true, retryText: last.text }];
  }
  return {
    uid,
    messages,
    draft: typeof saved.draft === 'string' ? saved.draft : '',
    regionIds: Array.isArray(saved.regionIds) ? saved.regionIds.filter((id) => getRegion(id)) : [],
    showPlanner: !!saved.showPlanner,
    // Only worth a "picked up where you left off" note when there's an
    // actual conversation to come back to, not just the greeting.
    restored: messages.length > 1,
  };
}

const resolve = (update, cur) => (typeof update === 'function' ? update(cur) : update);

// Mapr's live chat thread, city picks, and whether the trip-planner card is
// open all used to live as local useState in Mapr.jsx -- but Mapr.jsx
// unmounts like any other route the moment you tap over to another tab, so
// stepping away mid-conversation to check a landmark and coming back wiped
// the whole thread back to the opening greeting. This Provider sits above
// the router in App.jsx instead, so it survives leaving and returning to
// Mapr, and the thread, unsent draft and cities are also saved per account
// on this device so closing the app doesn't lose them either. Signing into
// a different account swaps to that account's own saved thread (or a fresh
// greeting), so a traveler on a shared device never sees someone else's
// half-built trip.
export function MaprChatProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // One state object, tagged with the account it belongs to, so the save
  // below can never write one account's thread under another's key during
  // the render where the signed-in account changes.
  const [chat, setChat] = useState(() => loadChat(uid));
  const [totalCost, setTotalCost] = useState(0);
  // Also shared, not local to Mapr.jsx -- a reply still in flight when you
  // tap away keeps resolving in the background (setMessages below is this
  // same shared setter either way), so the typing indicator and disabled
  // composer should track that correctly if you come back mid-reply,
  // instead of a freshly-mounted Mapr.jsx assuming nothing's happening.
  // Never saved: nothing is in flight after a relaunch.
  const [busy, setBusy] = useState(false);
  // Ref, not state -- this only needs to compare "did the signed-in
  // account actually change" on each render, it never needs to trigger one
  // itself.
  const uidRef = useRef(uid);

  useEffect(() => {
    if (uidRef.current === uid) return;
    uidRef.current = uid;
    setChat(loadChat(uid));
    setTotalCost(0);
    setBusy(false);
  }, [uid]);

  // Debounced save. The greeting-only thread with nothing typed clears the
  // stored copy instead, so "Discard" (or a fresh account) really is fresh.
  useEffect(() => {
    if (!chat.uid || chat.uid !== uid) return undefined;
    const t = setTimeout(() => {
      const empty = chat.messages.length <= 1 && !chat.draft && !chat.regionIds.length && !chat.showPlanner;
      if (empty) clearPersisted(storageKey(chat.uid));
      else
        writePersisted(storageKey(chat.uid), {
          messages: chat.messages.slice(-MAX_STORED_MESSAGES),
          draft: chat.draft,
          regionIds: chat.regionIds,
          showPlanner: chat.showPlanner,
        });
    }, 300);
    return () => clearTimeout(t);
  }, [chat, uid]);

  const setMessages = useCallback((u) => setChat((c) => ({ ...c, messages: resolve(u, c.messages) })), []);
  const setDraft = useCallback((u) => setChat((c) => ({ ...c, draft: resolve(u, c.draft) })), []);
  const setShowPlanner = useCallback((u) => setChat((c) => ({ ...c, showPlanner: resolve(u, c.showPlanner) })), []);
  // Stored as ids (full region objects carry every landmark), handed out as
  // the same region objects MultiRegionSearch works with.
  const regions = useMemo(() => chat.regionIds.map(getRegion).filter(Boolean), [chat.regionIds]);
  const setRegions = useCallback(
    (u) =>
      setChat((c) => {
        const cur = c.regionIds.map(getRegion).filter(Boolean);
        return { ...c, regionIds: resolve(u, cur).map((r) => r.id) };
      }),
    []
  );
  const dismissRestored = useCallback(() => setChat((c) => ({ ...c, restored: false })), []);
  // "Discard" on the restored-conversation note: back to the greeting.
  const discardChat = useCallback(() => setChat((c) => ({ ...freshChat(c.uid), draft: c.draft })), []);

  return (
    <MaprChatContext.Provider
      value={{
        messages: chat.messages,
        setMessages,
        draft: chat.draft,
        setDraft,
        regions,
        setRegions,
        showPlanner: chat.showPlanner,
        setShowPlanner,
        totalCost,
        setTotalCost,
        busy,
        setBusy,
        restored: chat.restored,
        dismissRestored,
        discardChat,
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
