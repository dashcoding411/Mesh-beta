import { useEffect, useMemo, useRef, useState } from "react";
import {
  SquarePen, Search as SearchIcon, Pin, BellOff, Ellipsis, MessageCircle, Inbox as InboxIcon, Mail, Users, Heart, SendHorizontal,
} from "lucide-react";
import {
  isRequest, togglePin, toggleMute, touchPresence, me, fetchThoughts, setThought, clearThought,
  thoughtLeft, hasLikedThought, likeThought, fetchThoughtLikes, replyToThought, QUICK_REACTIONS,
} from "../lib/db";
import { checkContent } from "../lib/moderation";
import { navigate } from "../lib/router";
import { shortTime } from "../lib/format";
import { readDraft } from "../lib/drafts";
import { useShell } from "./shell/ShellContext";
import TopBar from "./shell/TopBar";
import Tabs from "./ui/Tabs";
import Avatar from "./ui/Avatar";
import LiveAvatar from "./ui/LiveAvatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Dialog from "./ui/Dialog";
import { MenuItem, MenuGroup } from "./ui/Menu";
import { Input } from "./ui/Field";
import { EmptyState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";
import ChatView from "./ChatView";
import { NewChatDialog } from "./chat/NewChatDialog";
import { chatTitle, chatAvatar, chatPeer } from "../lib/chat";
import { hideInRequest } from "../lib/moderation";

// Two-pane on desktop; on mobile the open chat is its own route.
export default function Messages({ chatId }) {
  const { inbox, following } = useShell();
  const [tab, setTab] = useState("general");
  const [filter, setFilter] = useState("");
  const [composing, setComposing] = useState(null); // null | "message" | "group"

  useEffect(() => { touchPresence().catch(() => {}); }, []);

  const chats = inbox.chats;
  // Requests: chats started by people the user doesn't follow, until replied to.
  const buckets = useMemo(() => {
    const out = { general: [], requests: [] };
    for (const c of chats || []) {
      if (isRequest(c, following)) out.requests.push(c);
      else out.general.push(c);
    }
    return out;
  }, [chats, following]);

  const active = chats?.find((c) => c.id === chatId) || null;
  const pinnedCount = (chats || []).filter((c) => (c.pinnedBy || []).includes(me())).length;
  const q = filter.trim().toLowerCase();
  const visible = buckets[tab].filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
  const unreadIn = (id) => buckets[id].filter((c) => inbox.isUnread(c)).length;

  // A request isn't marked read until it's accepted, so the sender doesn't see "Seen".
  useEffect(() => {
    if (active && inbox.isUnread(active) && !isRequest(active, following)) inbox.markChatRead(active.id);
  }, [active, inbox, following]);

  return (
    <div className="flex min-h-0 flex-1">
      <section aria-label="Conversations"
        className={`${chatId ? "hidden md:flex" : "flex"} min-h-0 w-full flex-col border-r border-line md:w-[360px] md:shrink-0`}>
        <TopBar desktop title="Messages"
          right={
            <>
              <IconButton icon={Users} label="New group" onClick={() => setComposing("group")} />
              <IconButton icon={SquarePen} label="New message" onClick={() => setComposing("message")} />
            </>
          } />

        <div className="px-4 pb-2 pt-1">
          <label htmlFor="inbox-filter" className="sr-only">Search conversations</label>
          <div className="relative">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <Input id="inbox-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations" className="!min-h-10 !rounded-full !py-2 !pl-9 !text-callout" />
          </div>
        </div>

        <ThoughtsRail chats={chats} />

        <Tabs variant="underline" label="Inbox" value={tab} onChange={setTab} className="px-2"
          tabs={[
            { id: "general", label: "General", count: unreadIn("general") },
            { id: "requests", label: "Requests", count: buckets.requests.length },
          ]} />

        <div className="min-h-0 flex-1 overflow-y-auto" data-scroll>
          {chats === null && (
            <div className="space-y-1 p-2" role="status" aria-label="Loading conversations">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <Skeleton className="h-12 w-12 !rounded-full" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
                </div>
              ))}
            </div>
          )}
          {chats && visible.length === 0 && (
            q ? (
              <EmptyState compact icon={SearchIcon} title={`No conversations match “${filter.trim()}”`} />
            ) : tab === "requests" ? (
              <EmptyState compact icon={Mail} title="No message requests"
                body="Messages from people you don't follow wait here." />
            ) : (
              <EmptyState compact icon={MessageCircle} title="No messages yet"
                body="Message someone, or start a group."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="primary" icon={SquarePen} onClick={() => setComposing("message")}>New message</Button>
                    <Button icon={Users} onClick={() => setComposing("group")}>New group</Button>
                  </div>
                } />
            )
          )}
          <ul>
            {visible.map((c) => (
              <ChatRow key={c.id} chat={c} active={c.id === chatId} unread={inbox.isUnread(c)} pinnedCount={pinnedCount} request={tab === "requests"} />
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Conversation" className={`${chatId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {chatId && chats === null && <div className="flex-1" />}
        {chatId && chats && !active && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={InboxIcon} title="This conversation isn't available"
              body="It may have been removed, or you're no longer in it."
              action={<Button onClick={() => navigate("/messages")}>Back to Messages</Button>} />
          </div>
        )}
        {active && <ChatView key={active.id} chat={active} />}
        {!chatId && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={MessageCircle} title="Your messages"
              body="Pick a conversation, or start a new one."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon={SquarePen} onClick={() => setComposing("message")}>New message</Button>
                  <Button icon={Users} onClick={() => setComposing("group")}>New group</Button>
                </div>
              } />
          </div>
        )}
      </section>

      {composing && (
        <NewChatDialog group={composing === "group"} onClose={() => setComposing(null)}
          onCreated={(id) => { setComposing(null); navigate(`/messages/${id}`); }} />
      )}
    </div>
  );
}

function ChatRow({ chat, active, unread, pinnedCount, request }) {
  const toast = useToast();
  const { inbox } = useShell();
  const [menu, setMenu] = useState(false);
  const pinned = (chat.pinnedBy || []).includes(me());
  const muted = (chat.mutedBy || []).includes(me());
  const title = chatTitle(chat);
  const draft = active ? null : readDraft(`chat:${chat.id}`)?.data?.text?.trim();
  const preview = !chat.lastMessage ? "No messages yet"
    : request && chat.lastSenderId !== me() && hideInRequest(chat.lastMessage) ? "Message hidden: may be offensive"
      : `${chat.lastSenderId === me() ? "You: " : ""}${chat.lastMessage}`;

  const run = async (fn, done) => {
    setMenu(false);
    try { await fn(); if (done) toast({ title: done }); }
    catch (e) { toast({ tone: "error", title: e?.message || "That didn't work" }); }
  };

  return (
    <li className="group relative">
      <button type="button" onClick={() => navigate(`/messages/${chat.id}`)}
        aria-current={active ? "page" : undefined}
        aria-label={`${title}${unread ? ", unread" : ""}${pinned ? ", pinned" : ""}${muted ? ", muted" : ""}. ${draft ? `Draft: ${draft}` : preview}`}
        className={`flex min-h-[72px] w-full items-center gap-3 py-2.5 pl-4 pr-12 text-left transition-colors ${
          active ? "bg-surface-2" : "hover:bg-surface"
        }`}>
        <span className="relative shrink-0">
          <LiveAvatar uid={chatPeer(chat)} profile={chatAvatar(chat)} size={52} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-callout ${unread ? "font-bold text-fg" : "font-medium text-fg"}`}>{title}</span>
            {pinned && <Pin size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />}
            {muted && <BellOff size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />}
          </span>
          <span className="flex items-center gap-1.5">
            {draft ? (
              <span className="truncate text-caption text-fg-subtle"><span className="font-semibold text-danger-text">Draft:</span> {draft}</span>
            ) : (
              <span className={`truncate text-caption ${unread ? "font-semibold text-fg" : "text-fg-subtle"}`}>{preview}</span>
            )}
            <span className="shrink-0 text-caption text-fg-subtle" aria-hidden="true">· {shortTime(chat.updatedAt)}</span>
          </span>
        </span>
        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-text" aria-hidden="true" />}
      </button>
      <IconButton icon={Ellipsis} label={`Options for ${title}`} size={18} onClick={() => setMenu(true)}
        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" />

      {menu && (
        <Dialog title={title} onClose={() => setMenu(false)}>
          <MenuGroup>
            <MenuItem icon={Pin} description={pinned ? undefined : "Keep it at the top (up to 3)"}
              onClick={() => run(() => togglePin(chat, pinnedCount), pinned ? "Unpinned" : "Pinned")}>
              {pinned ? "Unpin" : "Pin to top"}
            </MenuItem>
            <MenuItem icon={BellOff} description={muted ? "Its messages count as unread again" : "It stays here, but stops counting towards your unread badge"}
              onClick={() => run(() => toggleMute(chat), muted ? "Unmuted" : "Muted")}>
              {muted ? "Unmute" : "Mute"}
            </MenuItem>
            <MenuItem icon={Mail} onClick={() => run(() => inbox.markChatUnread(chat.id), "Marked as unread")}>
              Mark as unread
            </MenuItem>
          </MenuGroup>
        </Dialog>
      )}
    </li>
  );
}

function ThoughtsRail({ chats }) {
  const toast = useToast();
  const { profile } = useShell();
  const [thoughts, setThoughts] = useState([]);
  const [mine, setMine] = useState(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null); // a friend's thought
  const [likes, setLikes] = useState(null); // on your own thought
  const now = useNow();
  const members = useMemo(() => [...new Set([me(), ...(chats || []).flatMap((c) => c.members)])].join(","), [chats]);
  const loaded = useRef("");

  useEffect(() => {
    if (!chats || loaded.current === members) return;
    loaded.current = members;
    fetchThoughts(members.split(",")).then((list) => {
      setThoughts(list.filter((n) => n.uid !== me()));
      setMine(list.find((n) => n.uid === me()) || null);
    }).catch(() => {});
  }, [chats, members]);

  const save = async (value) => {
    const t = value.trim();
    setBusy(true);
    try {
      if (t) {
        const mod = checkContent(t, { key: "thought", skipCooldown: true });
        if (mod.error) { setError(mod.error); setBusy(false); return; }
        await setThought(t);
        // Shaped like a Timestamp until the next load.
        const at = Date.now();
        setMine({ uid: me(), text: t, createdAt: { toMillis: () => at } });
        setLikes([]);
        toast({ title: "Thought shared", body: "It disappears after 24 hours." });
      } else {
        await clearThought();
        setMine(null);
        toast({ title: "Thought cleared" });
      }
      setEditing(false);
      setError("");
    } catch {
      setError("Couldn't save that. Try again.");
    } finally { setBusy(false); }
  };

  // Room above the avatars for the tallest bubble in the row.
  const lines = Math.max(1, ...[mine?.text, ...thoughts.map((n) => n.text)].map((t) => Math.min(5, Math.ceil((t || "").length / 14))));
  const room = { height: lines * 16 - 4 };

  return (
    <div className="border-b border-line">
      <ul className="flex gap-2 overflow-x-auto no-scrollbar px-3 pb-3 pt-3" aria-label="Thoughts">
        <li className="flex w-[120px] shrink-0 flex-col items-center gap-1.5">
          <button type="button" onClick={() => {
            setText(mine?.text || "");
            setEditing(true);
            if (mine) fetchThoughtLikes(mine).then(setLikes).catch(() => setLikes([]));
          }}
            aria-label={mine ? `Your thought: ${mine.text}. Edit or see likes` : "Share a thought"} className="press flex flex-col items-center">
            <span className="flex items-end justify-center" style={room}><Bubble muted={!mine}>{mine?.text || "Thought…"}</Bubble></span>
            <Avatar profile={profile} size={56} />
          </button>
          <span className="text-label text-fg-subtle">Your thought</span>
        </li>
        {thoughts.map((n) => (
          <li key={n.uid} className="flex w-[120px] shrink-0 flex-col items-center gap-1.5">
            <button type="button" onClick={() => setViewing(n)} className="press flex flex-col items-center"
              aria-label={`@${n.username}'s thought: ${n.text}. Like or reply`}>
              <span className="flex items-end justify-center" style={room}><Bubble>{n.text}</Bubble></span>
              <LiveAvatar uid={n.uid} profile={{ username: n.username }} size={56} />
            </button>
            <span className="w-full truncate text-center text-label text-fg-subtle">{n.username}</span>
          </li>
        ))}
      </ul>

      {editing && (
        <Dialog title="Share a thought" onClose={() => setEditing(false)} size="sm">
          <p className="mb-3 text-callout text-fg-muted">Shown for 24 hours.</p>
          {mine && (
            <div className="mb-4 rounded-control bg-surface-2 p-3">
              <p className="text-callout font-semibold">Your thought: "{mine.text}"</p>
              <p className="mt-0.5 text-caption text-fg-subtle">Disappears in {timeLeft(thoughtLeft(mine, now))}</p>
              <p className="mt-2 flex items-start gap-1.5 text-caption text-fg-muted">
                <Heart size={14} className="mt-0.5 shrink-0 text-like" aria-hidden="true" />
                {likes === null ? "Loading likes…" : likes.length === 0 ? "No likes yet. Replies arrive in your messages."
                  : <span>Liked by {likes.slice(0, 5).map((l) => `@${l.username}`).join(", ")}{likes.length > 5 ? ` and ${likes.length - 5} more` : ""}</span>}
              </p>
            </div>
          )}
          <label htmlFor="thought-input" className="sr-only">Your thought</label>
          <Input id="thought-input" value={text} onChange={(e) => { setText(e.target.value); setError(""); }} maxLength={60}
            placeholder="What's on your mind?" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(text); } }} />
          <p className="mt-1 text-right text-caption text-fg-subtle tabular">{60 - text.length} left</p>
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <div className="mt-4 flex gap-2">
            {mine && <Button className="flex-1" onClick={() => save("")} disabled={busy}>Clear thought</Button>}
            <Button className="flex-1" variant="primary" loading={busy} disabled={!text.trim()} onClick={() => save(text)}>Share</Button>
          </div>
        </Dialog>
      )}
      {viewing && <ThoughtSheet thought={viewing} now={now} onClose={() => setViewing(null)} />}
    </div>
  );
}

// Re-renders every minute so time left stays right.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** "5h 12m" until a thought disappears. Shown when one is opened. */
function timeLeft(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** A friend's thought: like it, or reply privately (it lands in your chat with them). */
function ThoughtSheet({ thought, now, onClose }) {
  const toast = useToast();
  const [liked, setLiked] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    hasLikedThought(thought).then((v) => { if (live) setLiked(v); }).catch(() => { if (live) setLiked(false); });
    return () => { live = false; };
  }, [thought]);

  const toggleLike = async () => {
    const on = !liked;
    setLiked(on);
    try { await likeThought(thought, on); }
    catch { setLiked(!on); toast({ tone: "error", title: "Couldn't like the thought" }); }
  };

  const send = async (text) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await replyToThought(thought, t);
      toast({ title: `Sent to @${thought.username}`, body: "It's in your messages with them." });
      onClose();
    } catch (err) {
      toast({ tone: "error", title: "Couldn't send your reply", body: err?.message?.startsWith("You can't message") ? err.message : "Check your connection and try again." });
      setSending(false);
    }
  };

  return (
    <Dialog title={`@${thought.username}'s thought`} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center">
        <LiveAvatar uid={thought.uid} profile={{ username: thought.username }} size={64} />
        <p className="mt-3 max-w-xs rounded-2xl border border-line-strong bg-surface-3 px-4 py-2.5 text-body text-fg [overflow-wrap:anywhere]">{thought.text}</p>
        <p className="mt-2 text-caption text-fg-subtle">Disappears in {timeLeft(thoughtLeft(thought, now))}</p>
        <button type="button" onClick={toggleLike} disabled={liked === null} aria-pressed={!!liked}
          aria-label={liked ? "Unlike thought" : `Like thought (only @${thought.username} sees)`}
          className="press mt-3 flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-50">
          <Heart size={28} aria-hidden="true" className={liked ? "fill-like text-like" : "text-fg"} />
        </button>
      </div>
      <div className="mt-3 flex justify-around" role="group" aria-label="Quick reactions">
        {QUICK_REACTIONS.map((r) => (
          <button key={r} type="button" onClick={() => send(r)} disabled={sending} aria-label={`Send ${r} to @${thought.username}`}
            className="press text-[1.7rem] leading-none disabled:opacity-50">{r}</button>
        ))}
      </div>
      <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(reply); }}>
        <label htmlFor="thought-reply" className="sr-only">{`Reply privately to @${thought.username}`}</label>
        <Input id="thought-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} autoComplete="off"
          placeholder={`Reply to @${thought.username}…`} className="flex-1" />
        <IconButton type="submit" icon={SendHorizontal} label="Send reply" tone="primary" disabled={sending || !reply.trim()} />
      </form>
    </Dialog>
  );
}

// Wraps over up to five lines, so a full 60-character thought shows, and
// overlaps the top of the avatar.
function Bubble({ children, muted }) {
  return (
    <span className={`relative z-10 -mb-3 max-w-full rounded-2xl border border-line-strong bg-surface-3 px-2 py-1 text-center text-label shadow-raised ${muted ? "text-fg-subtle" : "text-fg"}`}>
      <span className="line-clamp-5 break-words">{children}</span>
    </span>
  );
}
