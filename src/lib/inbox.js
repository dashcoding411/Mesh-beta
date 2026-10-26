import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listenChats, fetchMyReadTimes, markRead, markUnread, markDelivered, isRequest, isDeclined, me, tsMillis } from "./db";

// Single app-wide inbox subscription shared by the unread badge and Messages.
// It also sends delivery receipts: a chat updated by someone else since this
// account last received or read it is marked delivered.
export function useInbox(following, enabled = true) {
  const [chats, setChats] = useState(null);
  const [reads, setReads] = useState(new Map());
  const delivered = useRef(new Map()); // chatId -> latest update acknowledged

  useEffect(() => {
    if (!enabled) return;
    // Deleted requests leave the inbox entirely.
    return listenChats((list) => setChats(list && list.filter((c) => !isDeclined(c))));
  }, [enabled]);

  // Read markers are per-chat subcollections, read once per chat (this
  // device updates its own as you read), not streamed. Sorted, so a new
  // message reordering the inbox doesn't read them all again.
  const ids = (chats || []).map((c) => c.id).sort().join(",");
  const readFor = useRef({ uid: null, ids: new Set() });
  useEffect(() => {
    if (readFor.current.uid !== me()) readFor.current = { uid: me(), ids: new Set() };
    const done = readFor.current.ids;
    const fresh = ids ? ids.split(",").filter((id) => !done.has(id)) : [];
    if (!fresh.length) return;
    fresh.forEach((id) => done.add(id));
    let cancelled = false;
    fetchMyReadTimes(fresh)
      .then((fetched) => {
        if (cancelled) { fresh.forEach((id) => done.delete(id)); return; }
        for (const [id, m] of fetched) {
          delivered.current.set(id, Math.max(delivered.current.get(id) ?? 0, m.at, m.deliveredAt));
        }
        // Local markers set since the fetch started win.
        setReads((prev) => {
          const next = new Map(prev);
          for (const [id, m] of fetched) if (m.at > (next.get(id) ?? 0)) next.set(id, m.at);
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ids]);

  useEffect(() => {
    for (const chat of chats || []) {
      const known = delivered.current.get(chat.id);
      const at = tsMillis(chat.updatedAt);
      // Unknown until the markers load.
      if (known === undefined || !chat.lastSenderId || chat.lastSenderId === me() || at <= known) continue;
      delivered.current.set(chat.id, at);
      markDelivered(chat.id).catch(() => {});
    }
  }, [chats, reads]);

  const isUnread = useCallback((chat) => {
    const readAt = reads.get(chat.id) ?? 0;
    return !!chat.lastSenderId && chat.lastSenderId !== me() && tsMillis(chat.updatedAt) > readAt;
  }, [reads]);

  const unreadCount = useMemo(
    () => (chats || []).filter((c) =>
      isUnread(c) && !(c.mutedBy || []).includes(me()) && !isRequest(c, following)).length,
    [chats, isUnread, following]
  );

  const markChatRead = useCallback(async (chatId) => {
    setReads((prev) => new Map(prev).set(chatId, Date.now()));
    await markRead(chatId).catch(() => {});
  }, []);

  const markChatUnread = useCallback(async (chatId) => {
    setReads((prev) => new Map(prev).set(chatId, 0));
    await markUnread(chatId).catch(() => {});
  }, []);

  return { chats, isUnread, unreadCount, markChatRead, markChatUnread };
}
