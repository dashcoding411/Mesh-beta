import { useCallback, useEffect, useMemo, useState } from "react";
import { listenChats, fetchMyReadTimes, markRead, markUnread, isRequest, me, tsMillis } from "./db";

// Single app-wide inbox subscription shared by the unread badge and Messages.
export function useInbox(following, enabled = true) {
  const [chats, setChats] = useState(null);
  const [reads, setReads] = useState(new Map());

  useEffect(() => {
    if (!enabled) return;
    return listenChats(setChats);
  }, [enabled]);

  // Read markers are per-chat subcollections: fetched on chat-set change, not streamed.
  const ids = (chats || []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    fetchMyReadTimes(ids.split(","))
      .then((fetched) => {
        if (cancelled) return;
        // Local markers set since the fetch started win.
        setReads((prev) => {
          const next = new Map(fetched);
          for (const [id, at] of prev) if (at > (next.get(id) ?? 0)) next.set(id, at);
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ids]);

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
