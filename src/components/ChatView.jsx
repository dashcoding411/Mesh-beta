import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Info, SendHorizontal, ChartBar, X, Reply, Copy, Pencil, Undo2, ArrowDown, Play, Plus, Check, Mail, Palette, Users,
  UserPlus, LogOut, ShieldCheck, UserMinus, Ban,
} from "lucide-react";
import {
  listenMessages, sendMessage, searchUsers, openDirectChat, createGroupChat, me, tsMillis,
  listenTyping, setTyping, clearTyping, listenReads, listenPresence, presenceLabel,
  reactToMessage, groupReactions, QUICK_REACTIONS, canEdit, editMessage, unsendMessage,
  setChatTheme, setNickname, CHAT_THEMES, sendPoll, votePoll, openUserProfile, openPost, openWatch, kindLabel,
  addToGroup, removeFromGroup, setGroupAdmin, leaveGroupChat, renameGroupChat, groupAdmins, blockUser, unblockUser,
} from "../lib/db";
import { LIMITS } from "../lib/validate";
import { checkContent, checkName } from "../lib/moderation";
import { navigate } from "../lib/router";
import { dayLabel, clockTime, fullTime, plural } from "../lib/format";
import { mediaAlt } from "../lib/a11y";
import { chatTitle, chatAvatar } from "../lib/chat";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { MenuItem, MenuGroup } from "./ui/Menu";
import { Field, Input, Textarea, Select } from "./ui/Field";
import { Skeleton, InlineMessage, EmptyState } from "./ui/States";
import Badge from "./ui/Badge";
import { useToast } from "./ui/toast-context";

const GROUP_GAP = 5 * 60_000; // messages closer than this cluster together
const TIME_GAP = 60 * 60_000; // a gap longer than this gets a timestamp

const coarsePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/* Turn a flat list of messages into rows: day separators, time gaps, and
   messages marked as the first/last of a run from the same person, which
   is what lets bubbles cluster instead of each floating alone. */
function buildRows(messages) {
  const rows = [];
  const at = (m) => tsMillis(m.createdAt) || Date.now(); // pending writes have no server time yet
  const day = (t) => new Date(t).toDateString();
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const t = at(m);
    if (!prev || day(at(prev)) !== day(t)) rows.push({ type: "day", key: `d-${m.id}`, label: dayLabel(t) });
    else if (t - at(prev) > TIME_GAP) rows.push({ type: "time", key: `t-${m.id}`, label: clockTime(t) });
    const breaksBefore = !prev || prev.senderId !== m.senderId || t - at(prev) > GROUP_GAP || day(at(prev)) !== day(t);
    const breaksAfter = !next || next.senderId !== m.senderId || at(next) - t > GROUP_GAP || day(at(next)) !== day(t);
    rows.push({ type: "msg", key: m.id, m, first: breaksBefore, last: breaksAfter });
  });
  return rows;
}

/* One conversation. The details that make chat feel right, all here:
   clustered bubbles, day separators, the list only auto-scrolls if you're
   already at the bottom (otherwise a "new messages" pill appears), Enter
   sends on a keyboard and adds a line on a phone, Escape backs out of a
   reply, and a failed send keeps your words and offers to retry. */
export default function ChatView({ chat }) {
  const { inbox, blocked } = useShell();
  const toast = useToast();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [typing, setTypingUsers] = useState([]);
  const [reads, setReads] = useState(new Map());
  const [presence, setPresence] = useState(new Map());
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [dialog, setDialog] = useState(null); // info | poll
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [sending, setSending] = useState(false);
  const scroller = useRef(null);
  const inputRef = useRef(null);
  const lastCount = useRef(0);
  const firstLoad = useRef(true);

  const theme = CHAT_THEMES[chat.theme] || CHAT_THEMES.default;
  const others = useMemo(() => chat.members.filter((m) => m !== me()), [chat.members]);
  const title = chatTitle(chat);
  const blockedOther = !chat.isGroup && others[0] && blocked.has(others[0]);

  useEffect(() => listenMessages(chat.id, setMessages), [chat.id]);
  useEffect(() => listenTyping(chat.id, setTypingUsers), [chat.id]);
  useEffect(() => listenReads(chat.id, setReads), [chat.id]);
  useEffect(() => listenPresence(others, (uid, at) => setPresence((prev) => new Map(prev).set(uid, at))), [others]);
  useEffect(() => () => { clearTyping(chat.id).catch(() => {}); }, [chat.id]);

  // Keep read state current while the chat is open.
  useEffect(() => {
    if (messages?.length) inbox.markChatRead(chat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, chat.id]);

  const scrollToBottom = useCallback((smooth) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setUnseen(0);
  }, []);

  // First paint jumps to the newest message; after that, follow new
  // messages only if you were already at the bottom or sent them yourself.
  useLayoutEffect(() => {
    if (!messages) return;
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (firstLoad.current) { firstLoad.current = false; scrollToBottom(false); return; }
    if (added <= 0) return;
    const mineNewest = messages[messages.length - 1]?.senderId === me();
    if (atBottom || mineNewest) scrollToBottom(true);
    else setUnseen((n) => n + added);
  }, [messages, atBottom, scrollToBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAtBottom(near);
    if (near) setUnseen(0);
  };

  const send = async (value = text) => {
    const t = value.trim();
    if (!t || sending) return;
    if (t.length > LIMITS.message) return toast({ tone: "error", title: `Messages can be up to ${LIMITS.message} characters` });
    const mod = checkContent(t, { key: "msg", skipCooldown: true });
    if (mod.error) return toast({ tone: "error", title: mod.error });

    const wasEditing = editing;
    const wasReply = replyTo;
    setText("");
    setReplyTo(null);
    setEditing(null);
    setSending(true);
    try {
      if (wasEditing) await editMessage(chat.id, wasEditing, t);
      else await sendMessage(chat.id, t, wasReply
        ? { replyTo: { id: wasReply.id, text: (wasReply.text || "").slice(0, 90), senderId: wasReply.senderId } }
        : {});
    } catch (err) {
      console.error(err);
      // Put everything back so nothing typed is lost.
      setText(t);
      setReplyTo(wasReply);
      setEditing(wasEditing);
      toast(err?.code === "permission-denied"
        ? { tone: "error", title: "Message not sent", body: "This person isn't accepting your messages." }
        : { tone: "error", title: "Message not sent", body: "Check your connection.", action: { label: "Retry", onClick: () => send(t) } });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape" && (replyTo || editing)) {
      e.preventDefault();
      e.stopPropagation();
      setReplyTo(null);
      if (editing) { setEditing(null); setText(""); }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !coarsePointer() && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const rows = useMemo(() => buildRows(messages || []), [messages]);
  const last = messages?.[messages.length - 1];
  const seen = last && last.senderId === me() && !last.deleted &&
    others.some((uid) => (reads.get(uid) || 0) >= tsMillis(last.createdAt));
  const status = typing.length
    ? (chat.isGroup ? `${typing.map((u) => chat.memberNames?.[u] || "Someone").slice(0, 2).join(", ")} typing…` : "Typing…")
    : chat.isGroup ? plural(chat.members.length, "member") : presenceLabel(presence.get(others[0]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-nav flex h-16 shrink-0 items-center gap-1 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
        <IconButton icon={ArrowLeft} label="Back to Messages" className="md:hidden" onClick={() => navigate("/messages")} />
        <button type="button" onClick={() => (chat.isGroup ? setDialog("info") : openUserProfile(others[0]))}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-1 text-left hover:bg-surface">
          <span className="relative">
            <Avatar profile={chatAvatar(chat)} size={40} />
            {status === "Active now" && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-canvas bg-success-text" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-callout font-semibold">{title}</span>
            <span className={`block truncate text-caption ${typing.length ? "text-accent-text" : "text-fg-subtle"}`} aria-live="polite">{status}</span>
          </span>
        </button>
        <IconButton icon={Info} label="Conversation details" onClick={() => setDialog("info")} />
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4 md:px-6" data-scroll>
          {messages === null && (
            <div className="space-y-3" role="status" aria-label="Loading messages">
              <Skeleton className="h-10 w-2/3 !rounded-[20px]" />
              <Skeleton className="ml-auto h-10 w-1/2 !rounded-[20px]" />
              <Skeleton className="h-16 w-3/5 !rounded-[20px]" />
            </div>
          )}

          {messages?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Avatar profile={chatAvatar(chat)} size={80} />
              <p className="mt-3 text-title-3">{title}</p>
              <p className="mt-1 text-callout text-fg-muted">
                {chat.isGroup ? "The group's been made. Say hello." : "This is the start of your conversation."}
              </p>
            </div>
          )}

          {messages?.length > 0 && (
            <ol aria-label={`Messages with ${title}`} className="flex flex-col">
              {rows.map((row) => row.type === "msg" ? (
                <MessageRow key={row.key} row={row} chat={chat} theme={theme}
                  onReply={(m) => { setReplyTo(m); setEditing(null); inputRef.current?.focus(); }}
                  onEdit={(m) => { setEditing(m); setReplyTo(null); setText(m.text); inputRef.current?.focus(); }} />
              ) : (
                <li key={row.key} className={`my-4 text-center ${row.type === "day" ? "text-caption font-semibold text-fg-muted" : "text-label text-fg-subtle"}`}>
                  {row.label}
                </li>
              ))}
            </ol>
          )}

          {typing.length > 0 && (
            <div className="mt-2 flex items-end gap-2" aria-hidden="true">
              <span className="w-7" />
              <span className="inline-flex gap-1 rounded-[20px] bg-surface-3 px-4 py-3.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </div>
          )}
          {seen && <p className="mt-1 pr-1 text-right text-label text-fg-subtle">Seen</p>}
        </div>

        {unseen > 0 && (
          <button type="button" onClick={() => scrollToBottom(true)}
            className="press absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-4 text-caption font-semibold text-white shadow-overlay anim-rise">
            <ArrowDown size={14} aria-hidden="true" /> {plural(unseen, "new message")}
          </button>
        )}
      </div>

      {blockedOther ? (
        <div className="shrink-0 border-t border-line bg-canvas px-4 py-4 text-center md:px-6">
          <p className="text-callout text-fg-muted">You've blocked {title}. Unblock them in this conversation's details to message them.</p>
          <Button size="sm" className="mt-2" icon={Info} onClick={() => setDialog("info")}>Conversation details</Button>
        </div>
      ) : (
      <div className="shrink-0 border-t border-line bg-canvas px-3 pb-3 pt-2 md:px-6">
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-control bg-surface-2 py-1 pl-3 pr-1">
            {editing ? <Pencil size={14} className="shrink-0 text-accent-text" aria-hidden="true" /> : <Reply size={14} className="shrink-0 text-accent-text" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold text-accent-text">
                {editing ? "Editing your message" : `Replying to ${replyTo.senderId === me() ? "yourself" : chat.nicknames?.[replyTo.senderId] || chat.memberNames?.[replyTo.senderId] || "them"}`}
              </span>
              <span className="block truncate text-caption text-fg-muted">{(editing || replyTo).text}</span>
            </span>
            <IconButton icon={X} label={editing ? "Cancel editing" : "Cancel reply"} size={16}
              onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }} />
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
          {chat.isGroup && !editing && (
            <IconButton icon={ChartBar} label="Create a poll" tone="solid" onClick={() => setDialog("poll")} />
          )}
          <label htmlFor={`msg-${chat.id}`} className="sr-only">Message {title}</label>
          <Textarea id={`msg-${chat.id}`} ref={inputRef} autoGrow rows={1} maxRows={6} value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value) setTyping(chat.id).catch(() => {}); }}
            onKeyDown={onKeyDown} maxLength={LIMITS.message} enterKeyHint="send"
            placeholder={editing ? "Edit your message" : "Message…"}
            className="!min-h-11 !rounded-[22px] !py-2.5" />
          <IconButton type="submit" icon={editing ? Check : SendHorizontal} label={editing ? "Save edit" : "Send message"}
            tone="primary" disabled={!text.trim() || sending} />
        </form>
        {text.length > LIMITS.message * 0.9 && (
          <p className="mt-1 text-right text-caption text-warning-text tabular">{LIMITS.message - text.length} characters left</p>
        )}
      </div>
      )}

      {dialog === "info" && <ChatDetails chat={chat} onClose={() => setDialog(null)} />}
      {dialog === "poll" && <PollDialog chatId={chat.id} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MessageRow({ row, chat, theme, onReply, onEdit }) {
  const { m, first, last } = row;
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const mine = m.senderId === me();
  const name = chat.nicknames?.[m.senderId] || chat.memberNames?.[m.senderId] || "Someone";
  const reactions = groupReactions(m.reactions);
  const sent = tsMillis(m.createdAt); // 0 while the write is still in flight
  const when = sent ? clockTime(sent) : "sending";

  // Corners tighten on the side facing the rest of the run.
  const shape = mine
    ? `rounded-[20px] ${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}`
    : `rounded-[20px] ${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`;

  const react = async (emoji) => {
    setMenu(false);
    try { await reactToMessage(chat.id, m, emoji); }
    catch { toast({ tone: "error", title: "Couldn't add that reaction" }); }
  };

  const copy = async () => {
    setMenu(false);
    try { await navigator.clipboard.writeText(m.text || ""); toast({ title: "Copied" }); }
    catch { toast({ tone: "error", title: "Couldn't copy" }); }
  };

  const unsend = async () => {
    try { await unsendMessage(chat.id, m); setConfirmUnsend(false); toast({ title: "Message unsent" }); }
    catch { toast({ tone: "error", title: "Couldn't unsend that" }); }
  };

  if (m.deleted) {
    return (
      <li className={`flex ${mine ? "justify-end" : "justify-start pl-9"} ${first ? "mt-3" : "mt-0.5"}`}>
        <span className="rounded-[20px] border border-line px-4 py-2 text-caption italic text-fg-subtle">
          {mine ? "You unsent a message" : `${name} unsent a message`}
        </span>
      </li>
    );
  }

  return (
    <li className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${first ? "mt-3" : "mt-0.5"}`}>
      {!mine && (
        <span className="w-7 shrink-0">
          {last && (
            <button type="button" onClick={() => openUserProfile(m.senderId)} aria-label={`${name}'s profile`}>
              <Avatar profile={{ username: chat.memberNames?.[m.senderId] || "?", name }} size={28} />
            </button>
          )}
        </span>
      )}

      <div className={`flex max-w-[78%] min-w-0 flex-col md:max-w-[65%] ${mine ? "items-end" : "items-start"}`}>
        {chat.isGroup && !mine && first && <span className="mb-1 px-3 text-label font-semibold text-fg-subtle">{name}</span>}

        {m.replyTo && (
          <span className={`mb-1 max-w-full truncate rounded-[16px] border border-line bg-surface px-3 py-1.5 text-caption text-fg-subtle ${mine ? "mr-1" : "ml-1"}`}>
            <Reply size={12} className="mr-1 inline" aria-hidden="true" />{m.replyTo.text}
          </span>
        )}

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMenu(true)} onDoubleClick={() => react("❤️")}
            title={sent ? fullTime(sent) : "Sending…"}
            aria-label={`${mine ? "You" : name}${m.poll ? " sent a poll" : m.sharedPost ? " shared a post" : ""}: ${m.poll?.question || m.text || m.sharedPost?.title || m.sharedPost?.text || ""}. ${when}${m.editedAt ? ", edited" : ""}. Open message actions`}
            className={`min-w-0 text-left text-body ${shape} ${m.sharedPost && !m.text ? "p-1" : "px-4 py-2"} ${
              mine ? `bg-gradient-to-br text-white ${theme.bubble}` : "bg-surface-3 text-fg"
            }`}>
            {m.poll && <PollView chatId={chat.id} msg={m} mine={mine} />}
            {m.sharedPost && <SharedPostCard post={m.sharedPost} />}
            {!m.poll && m.text && <span className={`block whitespace-pre-wrap break-words ${m.sharedPost ? "px-3 pb-1 pt-2" : ""}`}>{m.text}</span>}
            {m.editedAt && <span className="block text-right text-label opacity-75">Edited</span>}
          </button>
          {/* Quick actions appear beside the bubble on hover or keyboard focus. */}
          <span className="hidden shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:inline-flex">
            <IconButton icon={Reply} label="Reply" size={16} onClick={() => onReply(m)} />
          </span>
        </div>

        {reactions.length > 0 && (
          <ul className={`-mt-1.5 flex gap-1 ${mine ? "mr-2" : "ml-2"}`} aria-label="Reactions">
            {reactions.map((r) => (
              <li key={r.emoji}>
                <button type="button" onClick={() => react(r.emoji)} aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.uids.length}${r.mine ? ", including you. Remove yours" : ". Add yours"}`}
                  className={`press inline-flex min-h-7 items-center gap-0.5 rounded-full border bg-surface-2 px-1.5 text-caption ${
                    r.mine ? "border-accent-text" : "border-line-strong"
                  }`}>
                  <span aria-hidden="true">{r.emoji}</span>
                  {r.uids.length > 1 && <span className="tabular text-label text-fg-muted" aria-hidden="true">{r.uids.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu && (
        <Dialog title="Message" hideTitle onClose={() => setMenu(false)}>
          <ul className="mb-3 flex justify-between gap-1" aria-label="React">
            {QUICK_REACTIONS.map((e) => (
              <li key={e}>
                <button type="button" onClick={() => react(e)} aria-label={`React with ${e}`}
                  className="press flex h-12 w-12 items-center justify-center rounded-full text-2xl hover:bg-surface-2">
                  {e}
                </button>
              </li>
            ))}
          </ul>
          <MenuGroup>
            <MenuItem icon={Reply} onClick={() => { setMenu(false); onReply(m); }}>Reply</MenuItem>
            {m.text && <MenuItem icon={Copy} onClick={copy}>Copy text</MenuItem>}
            {canEdit(m) && (
              <MenuItem icon={Pencil} description="For 15 minutes after sending" onClick={() => { setMenu(false); onEdit(m); }}>
                Edit
              </MenuItem>
            )}
            {mine && (
              <MenuItem icon={Undo2} danger description="Removes it for everyone" onClick={() => { setMenu(false); setConfirmUnsend(true); }}>
                Unsend
              </MenuItem>
            )}
          </MenuGroup>
          <p className="mt-3 px-3 text-caption text-fg-subtle">{sent ? `Sent ${fullTime(sent)}` : "Sending…"}</p>
        </Dialog>
      )}
      {confirmUnsend && (
        <ConfirmDialog title="Unsend this message?" confirmLabel="Unsend message"
          body="It'll be removed for everyone in the conversation." onConfirm={unsend} onClose={() => setConfirmUnsend(false)} />
      )}
    </li>
  );
}

/* A shared post is a real preview that opens the post, not a line of text. */
function SharedPostCard({ post }) {
  const isVideo = post.mediaType?.startsWith("video/");
  const open = (e) => {
    e.stopPropagation();
    if (post.kind === "video") openWatch(post.id);
    else if (post.kind === "short") navigate(`/flicks/${post.id}`);
    else openPost(post.id);
  };
  return (
    <span role="link" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e); }}
      aria-label={`Open ${kindLabel(post).toLowerCase()} by @${post.authorName}`}
      className="block w-[240px] cursor-pointer overflow-hidden rounded-[16px] bg-surface text-left text-fg ring-1 ring-line-strong hover:ring-fg-subtle">
      {post.mediaUrl ? (
        <span className="relative block aspect-[4/3] bg-black">
          {isVideo ? (
            <>
              <video src={`${post.mediaUrl}#t=1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"><Play size={20} fill="currentColor" /></span>
              </span>
            </>
          ) : (
            <img src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" className="h-full w-full object-cover" />
          )}
        </span>
      ) : (
        <span className="block bg-gradient-to-br from-violet-900/60 to-surface-2 px-3 py-4 text-callout">
          <span className="line-clamp-4">{post.text || "View post"}</span>
        </span>
      )}
      <span className="block px-3 py-2">
        <span className="block text-label font-semibold uppercase tracking-wide text-fg-subtle">{kindLabel(post)}</span>
        {(post.title || (post.mediaUrl && post.text)) && (
          <span className="block truncate text-caption font-semibold">{post.title || post.text}</span>
        )}
        <span className="block truncate text-label text-fg-subtle">@{post.authorName}</span>
      </span>
    </span>
  );
}

function PollView({ chatId, msg, mine }) {
  const toast = useToast();
  const votes = msg.poll.votes || {};
  const total = Object.keys(votes).length;
  const myVote = votes[me()];
  const vote = async (e, i) => {
    e.stopPropagation();
    try { await votePoll(chatId, msg, i); }
    catch { toast({ tone: "error", title: "Couldn't record your vote" }); }
  };
  return (
    <span className="block min-w-[220px] py-1">
      <span className="mb-2 flex items-center gap-1.5 font-semibold"><ChartBar size={15} aria-hidden="true" /> {msg.poll.question}</span>
      <span className="block space-y-1.5" role="group" aria-label="Poll options">
        {msg.poll.options.map((o, i) => {
          const count = Object.values(votes).filter((v) => v === i).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <span key={i} role="button" tabIndex={0} aria-pressed={myVote === i}
              aria-label={`${o.text}, ${pct}%${myVote === i ? ", your vote" : ""}`}
              onClick={(e) => vote(e, i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") vote(e, i); }}
              className={`relative block min-h-10 cursor-pointer overflow-hidden rounded-[12px] border px-3 py-2 text-caption ${
                myVote === i ? (mine ? "border-white" : "border-accent-text") : mine ? "border-white/40" : "border-line-strong"
              }`}>
              <span className={`absolute inset-y-0 left-0 ${mine ? "bg-white/20" : "bg-accent-soft"}`} style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="relative flex justify-between gap-3">
                <span className="flex items-center gap-1.5">{myVote === i && <Check size={13} aria-hidden="true" />}{o.text}</span>
                <span className="tabular opacity-80" aria-hidden="true">{pct}%</span>
              </span>
            </span>
          );
        })}
      </span>
      <span className="mt-1.5 block text-label opacity-75">{plural(total, "vote")}</span>
    </span>
  );
}

function PollDialog({ chatId, onClose }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (q.length < 3) return setError("Ask a question of at least 3 characters.");
    if (opts.length < 2) return setError("Add at least two options.");
    const mod = checkContent([q, ...opts].join("\n"), { key: "poll", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    try { await sendPoll(chatId, q, opts); onClose(); }
    catch { setError("Couldn't post the poll. Try again."); setBusy(false); }
  };

  return (
    <Dialog title="New poll" onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Question" count={question.length} max={120}>
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} placeholder="Where should we eat?" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-callout font-medium">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} maxLength={60} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <IconButton icon={X} label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))} />
              )}
            </div>
          ))}
          {options.length < 4 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setOptions([...options, ""])}>Add an option</Button>
          )}
        </fieldset>
        <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
        <Button type="submit" variant="primary" full loading={busy}>Post poll</Button>
      </form>
    </Dialog>
  );
}

/* Conversation details. For a group: its name, who's in it, who runs it,
   adding people, and leaving. For one-to-one: nicknames and blocking. Theme
   for both. Every membership change is checked by the rules, not just here. */
function ChatDetails({ chat, onClose }) {
  const toast = useToast();
  const { inbox, blocked, setBlocked } = useShell();
  const others = chat.members.filter((m) => m !== me());
  const admins = groupAdmins(chat);
  const amAdmin = admins.includes(me());
  const [target, setTarget] = useState(others[0] || "");
  const [nick, setNick] = useState("");
  const [name, setName] = useState(chat.name || "");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // add | leave | block
  const nameOf = (uid) => (uid === me() ? "You" : `@${chat.memberNames?.[uid] || "member"}`);
  const other = !chat.isGroup ? others[0] : null;
  const otherBlocked = other && blocked.has(other);

  const run = async (fn, done, fail = "That didn't work") => {
    try { await fn(); if (done) toast({ title: done }); }
    catch (e) { toast({ tone: "error", title: e?.code === "permission-denied" ? "Only group admins can do that" : fail }); }
  };

  const theme = (id) => run(() => setChatTheme(chat.id, id), `Theme: ${CHAT_THEMES[id].label}`, "Couldn't change the theme");

  const saveNick = async (e) => {
    e.preventDefault();
    const check = checkName(nick);
    if (check.error) return setError(check.error);
    try {
      await setNickname(chat.id, target, nick.trim());
      setNick("");
      setError("");
      toast({ title: nick.trim() ? "Nickname saved" : "Nickname cleared" });
    } catch { setError("Couldn't save the nickname."); }
  };

  const rename = async (e) => {
    e.preventDefault();
    const t = name.trim();
    if (t.length < LIMITS.chatName.min) return setError(`Group names need at least ${LIMITS.chatName.min} characters.`);
    const check = checkName(t);
    if (check.error) return setError(check.error);
    setError("");
    run(() => renameGroupChat(chat.id, t.slice(0, LIMITS.chatName.max)), "Group renamed", "Couldn't rename the group");
  };

  const toggleBlock = async () => {
    const who = { id: other, username: chat.memberNames?.[other] };
    try {
      if (otherBlocked) {
        await unblockUser(other);
        setBlocked((prev) => { const n = new Set(prev); n.delete(other); return n; });
        toast({ title: `Unblocked ${nameOf(other)}` });
      } else {
        await blockUser(who);
        setBlocked((prev) => new Set(prev).add(other));
        toast({ title: `Blocked ${nameOf(other)}`, body: "They can't message you, follow you or comment on your posts." });
      }
      setDialog(null);
    } catch { toast({ tone: "error", title: "Couldn't update the block" }); }
  };

  return (
    <Dialog title={chat.isGroup ? chatTitle(chat) : "Conversation details"} onClose={onClose} size="lg">
      <div className="space-y-7">
        {chat.isGroup && (
          <form onSubmit={rename} className="flex items-end gap-2">
            <Field label="Group name" className="flex-1" error={error && dialog === null ? error : ""}>
              <Input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={LIMITS.chatName.max} />
            </Field>
            <Button type="submit" disabled={name.trim() === (chat.name || "")}>Rename</Button>
          </form>
        )}

        {chat.isGroup && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
                <Users size={13} aria-hidden="true" /> {plural(chat.members.length, "member")}
              </h3>
              <Button size="sm" icon={UserPlus} onClick={() => setDialog("add")}>Add people</Button>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {chat.members.map((uid) => {
                const isAdmin = admins.includes(uid);
                return (
                  <li key={uid} className="flex min-h-14 flex-wrap items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => { if (uid !== me()) { onClose(); openUserProfile(uid); } }}
                      className="press flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar profile={{ username: chat.memberNames?.[uid] || "?" }} size={36} />
                      <span className="truncate text-callout">{nameOf(uid)}</span>
                      {isAdmin && <Badge tone="accent" icon={ShieldCheck}>Admin</Badge>}
                    </button>
                    {amAdmin && uid !== me() && (
                      <span className="flex gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => run(() => setGroupAdmin(chat, uid, !isAdmin), isAdmin ? "No longer an admin" : "Made an admin")}>
                          {isAdmin ? "Remove admin" : "Make admin"}
                        </Button>
                        <IconButton icon={UserMinus} label={`Remove ${nameOf(uid)} from the group`} size={18}
                          onClick={() => run(() => removeFromGroup(chat, uid), `Removed ${nameOf(uid)}`)} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!amAdmin && <p className="mt-2 text-caption text-fg-subtle">Only admins can remove people. Anyone in the group can add people.</p>}
          </section>
        )}

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle"><Palette size={13} aria-hidden="true" /> Theme</h3>
          <div role="radiogroup" aria-label="Chat theme" className="flex flex-wrap gap-3">
            {Object.entries(CHAT_THEMES).map(([id, t]) => {
              const on = (chat.theme || "default") === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} aria-label={t.label} onClick={() => theme(id)}
                  className="press flex flex-col items-center gap-1.5">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${t.bubble} ${on ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}>
                    {on && <Check size={18} className="text-white" aria-hidden="true" />}
                  </span>
                  <span className="text-label text-fg-muted">{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-fg-subtle">Nicknames</h3>
          <form onSubmit={saveNick} className="space-y-3">
            {chat.isGroup && (
              <Field label="Who">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {others.map((uid) => <option key={uid} value={uid}>@{chat.memberNames?.[uid] || uid.slice(0, 6)}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Nickname" hint="Only shown inside this conversation. Leave blank to clear it." error={!chat.isGroup ? error : ""}>
              <Input value={nick} onChange={(e) => { setNick(e.target.value); setError(""); }} maxLength={30}
                placeholder={chat.nicknames?.[target] || "Set a nickname"} />
            </Field>
            <Button type="submit" size="sm">Save nickname</Button>
          </form>
        </section>

        <MenuGroup>
          <MenuItem icon={Mail} onClick={async () => { await inbox.markChatUnread(chat.id); onClose(); navigate("/messages"); }}>
            Mark as unread
          </MenuItem>
          {chat.isGroup ? (
            <MenuItem icon={LogOut} danger onClick={() => setDialog("leave")}
              description={amAdmin && admins.length === 1 && others.length ? "Someone else will become the admin" : undefined}>
              Leave group
            </MenuItem>
          ) : (
            <MenuItem icon={Ban} danger={!otherBlocked} onClick={() => setDialog("block")}
              description={otherBlocked ? undefined : "They won't be able to message you, follow you or comment on your posts"}>
              {otherBlocked ? `Unblock ${nameOf(other)}` : `Block ${nameOf(other)}`}
            </MenuItem>
          )}
        </MenuGroup>
      </div>

      {dialog === "add" && <AddPeopleDialog chat={chat} onClose={() => setDialog(null)} />}
      {dialog === "leave" && (
        <ConfirmDialog title={`Leave ${chatTitle(chat)}?`} confirmLabel="Leave group"
          body="You'll stop getting its messages. Someone in the group would need to add you back."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await leaveGroupChat(chat); onClose(); navigate("/messages", { replace: true }); toast({ title: "You left the group" }); }
            catch { toast({ tone: "error", title: "Couldn't leave the group" }); }
          }} />
      )}
      {dialog === "block" && (
        <ConfirmDialog title={otherBlocked ? `Unblock ${nameOf(other)}?` : `Block ${nameOf(other)}?`}
          confirmLabel={otherBlocked ? "Unblock" : "Block"} tone={otherBlocked ? "accent" : "danger"}
          body={otherBlocked
            ? "They'll be able to follow you and message you again. They won't be told."
            : "They won't be told. They can't message you, follow you or comment on your posts, and you'll stop seeing their posts."}
          onClose={() => setDialog(null)} onConfirm={toggleBlock} />
      )}
    </Dialog>
  );
}

function AddPeopleDialog({ chat, onClose }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 1) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => !chat.members.includes(u.id)));
      } else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [term, chat.members]);

  const add = async (u) => {
    setBusy(u.id);
    const skipped = await addToGroup(chat.id, [u]);
    setBusy("");
    if (skipped.length) toast({ tone: "error", title: `Couldn't add @${u.username}`, body: "They only accept messages and group adds from people they follow." });
    else {
      toast({ title: `Added @${u.username}` });
      setResults((r) => r?.filter((x) => x.id !== u.id) || null);
    }
  };

  return (
    <Dialog title="Add people" onClose={onClose}>
      <label htmlFor="add-people" className="sr-only">Search by handle</label>
      <Input id="add-people" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by handle" autoCapitalize="none" />
      <ul className="mt-3 space-y-1">
        {results?.map((u) => (
          <li key={u.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
            <Avatar profile={u} size={36} />
            <span className="min-w-0 flex-1 truncate text-callout">@{u.username}</span>
            <Button size="sm" variant="primary" icon={UserPlus} loading={busy === u.id} onClick={() => add(u)}>Add</Button>
          </li>
        ))}
      </ul>
      {results?.length === 0 && <EmptyState compact title={`No one to add called “${term.trim()}”`} body="Handles are exact, so check the spelling." />}
    </Dialog>
  );
}

/* New message or new group. A message goes to one person; a group needs at
   least two others and takes an optional name. People who only accept
   messages from accounts they follow are skipped, with a note saying who. */
export function NewChatDialog({ onClose, onCreated, group = false }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const needed = group ? 2 : 1;

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 1) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => u.id !== me() && !selected.some((s) => s.id === u.id)));
      } else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [term, selected]);

  const pick = (u) => {
    setSelected(group ? [...selected, u] : [u]);
    setTerm("");
    inputRef.current?.focus();
  };

  const start = async () => {
    setError("");
    if (selected.length < needed) return setError(group ? "Pick at least two people for a group." : "Pick someone to message.");
    setBusy(true);
    try {
      if (!group) {
        onCreated(await openDirectChat(selected[0]));
        return;
      }
      const name = groupName.trim() || selected.map((s) => s.username).slice(0, 3).join(", ");
      const check = checkName(name);
      if (check.error) { setBusy(false); return setError(check.error); }
      const { id, skipped } = await createGroupChat(name.slice(0, LIMITS.chatName.max), selected);
      if (skipped.length) {
        toast({ tone: "info", title: `Group made without ${skipped.map((u) => `@${u.username}`).join(", ")}`, body: "They only accept group adds from people they follow." });
      }
      onCreated(id);
    } catch (err) {
      console.error(err);
      setError(err?.message?.startsWith("You can't message") ? err.message : "Couldn't start the conversation. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={group ? "New group" : "New message"} onClose={onClose} initialFocusRef={inputRef}
      footer={
        <div className="space-y-2">
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <Button variant="primary" full loading={busy} disabled={selected.length < needed} onClick={start}>
            {group ? (selected.length >= 2 ? `Create group with ${selected.length} people` : "Pick at least two people") : "Start conversation"}
          </Button>
        </div>
      }>
      {group && (
        <Field label="Group name" optional className="mb-4">
          <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={LIMITS.chatName.max}
            placeholder={selected.length ? selected.map((s) => s.username).slice(0, 3).join(", ") : "e.g. Weekend plans"} />
        </Field>
      )}
      {selected.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Selected people">
          {selected.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setSelected(selected.filter((s) => s.id !== u.id))}
                aria-label={`Remove @${u.username}`}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft pl-1 pr-3 text-caption font-semibold text-accent-ring">
                <Avatar profile={u} size={24} /> @{u.username} <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="new-chat-search" className="sr-only">Search by handle</label>
      <Input id="new-chat-search" ref={inputRef} placeholder={group ? "Add people by handle" : "Search by handle"} value={term} autoCapitalize="none"
        onChange={(e) => setTerm(e.target.value)} />
      <ul className="mt-3 space-y-1">
        {results?.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => pick(u)}
              className="press flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
              <Avatar profile={u} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-callout font-medium">{u.name || u.username}</span>
                <span className="block truncate text-caption text-fg-subtle">@{u.username}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {results?.length === 0 && <EmptyState compact title={`No one called “${term.trim()}”`} body="Handles are exact, so check the spelling." />}
    </Dialog>
  );
}
