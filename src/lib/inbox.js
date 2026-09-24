import { useCallback, useEffect, useMemo, useState } from "react";
import { listenChats, fetchMyReadTimes, markRead, markUnread, isRequest, me, tsMillis } from "./db";

/* One inbox listener for the whole app. The unread badge on the Messages tab
   and the Messages page itself read the same state, so opening a chat clears
   the badge immediately instead of on the next snapshot. */
export function useInbox(following, enabled = true) {
  const [chats, setChats] = useState(null);
  const [reads, setReads] = useState(new Map());

  useEffect(() => {
    if (!enabled) return;
    return listenChats(setChats);
  }, [enabled]);

  // Read markers live in a subcollection per chat, so they're fetched when
  // the set of chats changes rather than streamed.
  const ids = (chats || []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    fetchMyReadTimes(ids.split(","))
      .then((fetched) => {
        if (cancelled) return;
        // Keep any read marker set locally since the fetch began, it's newer.
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
