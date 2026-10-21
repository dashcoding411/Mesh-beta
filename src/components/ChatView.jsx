import { enablePush, shouldOfferPush } from "../lib/push";
import {
  ArrowDown, ArrowLeft, Ban, ChartBar, Check, ImagePlus, Info, Mic, Pencil, Phone, Reply, SendHorizontal,
  Sticker, Trash2, Video, X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { callsSupported } from "../lib/calls";
import { chatAvatar, chatPeer, chatTitle } from "../lib/chat";
import {
  CHAT_THEMES, MESSAGE_PAGE, answerRequest, blockUser, clearTyping, editMessage, isRequest, listenMessages, listenPresence, listenReads,
  listenTyping, me, openUserProfile, presenceLabel, sendMessage, sendPhotoMessage, sendVoiceMessage, setTyping,
  tsMillis,
} from "../lib/db";
import { clockTime, dayLabel, plural, shortTime } from "../lib/format";
import { gifsEnabled } from "../lib/gifs";
import { checkContent, childSafetyBlock } from "../lib/moderation";
import { checkFile, UNSAFE_PHOTO } from "../lib/imageCheck";
import { navigate } from "../lib/router";
import { usePageTitle } from "../lib/usePageTitle";
import { LIMITS } from "../lib/validate";
import { MAX_VOICE_SECONDS, useVoiceRecorder, voiceSupported } from "../lib/voice";
import GifPicker from "./GifPicker";
import { LiveBars } from "./Voice";
import { ChatDetails } from "./chat/ChatDetails";
import { MessageRow } from "./chat/MessageRow";
import { PollDialog } from "./chat/PollDialog";
import { readDraft, useDraft } from "../lib/drafts";
import { useShell } from "./shell/ShellContext";
import LiveAvatar from "./ui/LiveAvatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";
import MentionTextarea from "./ui/MentionTextarea";
import { isFreshAccount } from "../lib/fresh";

const GROUP_GAP = 5 * 60_000; // messages closer than this cluster together

const TIME_GAP = 60 * 60_000; // a gap longer than this gets a timestamp

const coarsePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

// Groups messages into rows with day separators, time gaps and run boundaries.
function buildRows(messages) {
  const rows = [];
  const at = (m) => tsMillis(m.createdAt) || Date.now(); // pending writes have no server time
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

// Status of the viewer's latest message: Sending, Sent, Delivered, then Seen.
function receiptFor(m, chat, others, reads) {
  if (m.pending) return "Sending…";
  const sent = tsMillis(m.createdAt);
  const seenBy = others.filter((uid) => (reads.get(uid)?.at || 0) >= sent);
  if (seenBy.length && !chat.isGroup) {
    const t = shortTime(reads.get(seenBy[0]).at);
    return t === "now" ? "Seen" : /^\d+[mhd]$/.test(t) ? `Seen ${t} ago` : `Seen ${t}`;
  }
  if (seenBy.length === others.length && seenBy.length) return "Seen by everyone";
  if (seenBy.length) {
    const names = seenBy.map((uid) => chat.nicknames?.[uid] || chat.memberNames?.[uid] || "someone");
    return `Seen by ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}`;
  }
  return others.some((uid) => (reads.get(uid)?.deliveredAt || 0) >= sent) ? "Delivered" : "Sent";
}

// Auto-scrolls only when already at the bottom; otherwise shows a "new
// messages" pill. Enter sends on desktop, inserts a newline on touch.
export default function ChatView({ chat }) {
  const { inbox, blocked, setBlocked, following, startCall, inCall, needsAccount, profile } = useShell();
  const request = isRequest(chat, following);
  const [answering, setAnswering] = useState("");
  const recorder = useVoiceRecorder();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const stopping = useRef(false);
  const toast = useToast();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState(() => readDraft(`chat:${chat.id}`)?.data?.text || "");
  const [typing, setTypingUsers] = useState([]);
  const [reads, setReads] = useState(new Map());
  const [presence, setPresence] = useState(new Map());
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [dialog, setDialog] = useState(null); // info | poll | gif
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [sending, setSending] = useState(false);
  // Unsent photos: [{ id, file, url: object URL }]
  const [photos, setPhotos] = useState([]);
  const photoInput = useRef(null);
  useDraft(`chat:${chat.id}`, text.trim() && !editing ? { text } : null);
  const scroller = useRef(null);
  const inputRef = useRef(null);
  const lastCount = useRef(0);
  const firstLoad = useRef(true);

  const theme = CHAT_THEMES[chat.theme] || CHAT_THEMES.default;
  const others = useMemo(() => chat.members.filter((m) => m !== me()), [chat.members]);
  const title = chatTitle(chat);
  usePageTitle(title, 1);
  const blockedOther = !chat.isGroup && others[0] && blocked.has(others[0]);

  // The newest messages; "Earlier messages" asks for more.
  const [count, setCount] = useState(MESSAGE_PAGE);
  const olderFrom = useRef(null); // scroll height before earlier messages load
  useEffect(() => listenMessages(chat.id, setMessages, count), [chat.id, count]);
  const showEarlier = () => {
    olderFrom.current = scroller.current?.scrollHeight ?? null;
    setCount((n) => n + MESSAGE_PAGE);
  };
  useEffect(() => listenTyping(chat.id, setTypingUsers), [chat.id]);
  useEffect(() => listenReads(chat.id, setReads), [chat.id]);
  // Online status is only shown, and only readable, for 1:1 chats.
  useEffect(() => (chat.isGroup ? undefined
    : listenPresence(others, (uid, at) => setPresence((prev) => new Map(prev).set(uid, at)))), [others, chat.isGroup]);
  useEffect(() => () => { clearTyping(chat.id).catch(() => {}); }, [chat.id]);

  // Requests stay unread for the sender until accepted.
  useEffect(() => {
    if (messages?.length && !request) inbox.markChatRead(chat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, chat.id, request]);

  const answer = async (choice) => {
    setAnswering(choice);
    try {
      if (choice === "block") {
        await blockUser({ id: others[0], username: chat.memberNames?.[others[0]] || "" });
        setBlocked((prev) => new Set(prev).add(others[0]));
      }
      await answerRequest(chat, choice === "accept");
      if (choice === "accept") {
        inbox.markChatRead(chat.id);
        toast({ title: "Request accepted", body: "This conversation is in General now." });
      } else {
        toast({ title: choice === "block" ? `${title} is blocked` : chat.isGroup ? "You left the group" : "Request deleted" });
        navigate("/messages", { replace: true });
      }
    } catch {
      toast({ tone: "error", title: "Couldn't update the request", body: "Check your connection and try again." });
    } finally {
      setAnswering("");
    }
  };

  const scrollToBottom = useCallback((smooth) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setUnseen(0);
  }, []);

  // Jump to the end on first load; afterwards follow only when pinned to the
  // bottom or for own messages.
  useLayoutEffect(() => {
    if (!messages) return;
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (firstLoad.current) { firstLoad.current = false; scrollToBottom(false); return; }
    // Earlier messages arrived above: keep the same ones in view.
    if (olderFrom.current !== null && added > 0) {
      const el = scroller.current;
      if (el) el.scrollTop += el.scrollHeight - olderFrom.current;
      olderFrom.current = null;
      return;
    }
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

  const pickPhotos = (e) => {
    const files = [...(e.target.files || [])].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    const entries = files.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
    setPhotos((list) => [...list, ...entries].slice(0, 10));
    inputRef.current?.focus();
    // Nudity and sexual images can't be sent; they're checked on the device.
    for (const p of entries) {
      checkFile(p.file).then((verdict) => {
        if (verdict === "ok") return;
        dropPhoto(p.id);
        toast({ tone: "error", title: "Photo removed", body: UNSAFE_PHOTO });
      }).catch(() => {});
    }
  };
  const dropPhoto = (id) => setPhotos((list) => {
    list.filter((p) => p.id === id).forEach((p) => URL.revokeObjectURL(p.url));
    return list.filter((p) => p.id !== id);
  });

  // One message per photo, then the text. Failed photos stay in the tray.
  const sendPhotos = async () => {
    const queue = photos;
    setSending(true);
    const failed = [];
    let reason = "";
    for (const p of queue) {
      try { await sendPhotoMessage(chat.id, p.file); URL.revokeObjectURL(p.url); }
      catch (err) {
        console.error(err);
        failed.push(p);
        reason = err?.name === "UnsafeImageError" ? err.message
          : err?.code === "permission-denied" ? "This person isn't accepting your messages." : err?.message?.includes("too") ? err.message : "Check your connection and try again.";
      }
    }
    setPhotos(failed);
    setSending(false);
    if (failed.length) toast({ tone: "error", title: failed.length === queue.length ? "Photos not sent" : `${plural(failed.length, "photo")} not sent`, body: reason });
    return !failed.length;
  };

  const send = async (value = text) => {
    if (needsAccount("message people")) return;
    if (photos.length && !editing && !sending) {
      const ok = await sendPhotos();
      if (!ok || !value.trim()) return;
    }
    const t = value.trim();
    if (!t || sending) return;
    if (t.length > LIMITS.message) return toast({ tone: "error", title: `Messages can be up to ${LIMITS.message} characters` });
    // DMs skip the hate filter (block/report instead); spam checks still
    // apply, and so does the child safety check.
    const csam = childSafetyBlock(t);
    if (csam) return toast({ tone: "error", title: csam });
    const mod = checkContent(t, { key: "msg", skipCooldown: true, hate: false });
    if (mod.error) return toast({ tone: "error", title: mod.error });

    const wasEditing = editing;
    const wasReply = replyTo;
    setText("");
    setReplyTo(null);
    setEditing(null);
    setSending(true);
    try {
      if (wasEditing) await editMessage(chat.id, wasEditing, t);
      else {
        await sendMessage(chat.id, t, wasReply
          ? { replyTo: { id: wasReply.id, text: (wasReply.text || "").slice(0, 90), senderId: wasReply.senderId } }
          : {});
        // Once in a while, offer notifications so replies don't go unseen.
        shouldOfferPush().then((offer) => offer && toast({
          title: "Know when they reply?",
          body: "Turn on notifications for messages on this device.",
          action: { label: "Turn on", onClick: () => enablePush().catch(() => {}) },
        }));
      }
    } catch (err) {
      console.error(err);
      // Restore input state for retry.
      setText(t);
      setReplyTo(wasReply);
      setEditing(wasEditing);
      // New accounts can't send links to someone who doesn't follow them (the rules).
      const link = /https?:\/\/|www\./i.test(t) && isFreshAccount(profile);
      toast(err?.code === "permission-denied"
        ? { tone: "error", title: "Message not sent", body: link ? "New accounts can't send links to people who don't follow them yet." : "This person isn't accepting your messages." }
        : { tone: "error", title: "Message not sent", body: "Check your connection.", action: { label: "Retry", onClick: () => send(t) } });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Voice notes auto-stop and send at MAX_VOICE_SECONDS.
  const finishVoice = async () => {
    if (stopping.current) return;
    stopping.current = true;
    try {
      const res = await recorder.stop();
      if (!res) return;
      if (res.duration < 1) return toast({ tone: "info", title: "Hold on a little longer", body: "Voice messages need at least a second." });
      setVoiceBusy(true);
      await sendVoiceMessage(chat.id, res.blob, res.duration, res.peaks);
    } catch (err) {
      console.error(err);
      toast(err?.code === "permission-denied"
        ? { tone: "error", title: "Voice message not sent", body: "This person isn't accepting your messages." }
        : { tone: "error", title: "Voice message not sent", body: err?.message?.includes("too") ? err.message : "Check your connection and try again." });
    } finally {
      stopping.current = false;
      setVoiceBusy(false);
    }
  };
  const startVoice = async () => {
    try {
      await recorder.start();
      recorder.setAutoStop(finishVoice);
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "Couldn't use the microphone",
        body: err?.name === "NotAllowedError" ? "Allow microphone access for this site in your browser settings." : "Check that a microphone is connected." });
    }
  };
  const sendGif = async (g) => {
    if (needsAccount("message people")) return;
    setDialog(null);
    try {
      await sendMessage(chat.id, "", { gif: { url: g.url, width: g.width, height: g.height, title: g.title } });
    } catch {
      toast({ tone: "error", title: "GIF not sent", body: "Check your connection and try again." });
    }
  };
  const canCall = !chat.isGroup && !blockedOther && callsSupported();

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
  const receipt = last && last.senderId === me() && !last.deleted ? receiptFor(last, chat, others, reads) : "";
  const status = typing.length
    ? (chat.isGroup ? `${typing.map((u) => chat.memberNames?.[u] || "Someone").slice(0, 2).join(", ")} typing…` : "Typing…")
    : chat.isGroup ? plural(chat.members.length, "member") : presenceLabel(presence.get(others[0]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-nav flex h-16 shrink-0 items-center gap-1 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur glass-solid">
        {/* On phones the list (and its "Messages" heading) is hidden, so the chat names the page. */}
        <h1 className="sr-only md:hidden">Conversation with {title}</h1>
        <IconButton icon={ArrowLeft} label="Back to Messages" className="md:hidden" onClick={() => navigate("/messages")} />
        <button type="button" onClick={() => (chat.isGroup ? setDialog("info") : openUserProfile(others[0]))}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-1 text-left hover:bg-surface">
          <span className="relative">
            <LiveAvatar uid={chatPeer(chat)} profile={chatAvatar(chat)} size={40} />
            {status === "Active now" && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-canvas bg-success-text" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-callout font-semibold">{title}</span>
            <span className={`block truncate text-caption ${typing.length ? "text-accent-text" : "text-fg-subtle"}`} aria-live="polite">{status}</span>
          </span>
        </button>
        {canCall && (
          <>
            <IconButton icon={Phone} label={`Voice call ${title}`} disabled={inCall} onClick={() => startCall(chat, false)} />
            <IconButton icon={Video} label={`Video call ${title}`} disabled={inCall} onClick={() => startCall(chat, true)} />
          </>
        )}
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
              <LiveAvatar uid={chatPeer(chat)} profile={chatAvatar(chat)} size={80} />
              <p className="mt-3 text-title-3">{title}</p>
              <p className="mt-1 text-callout text-fg-muted">
                {chat.isGroup ? "The group's been made. Say hello." : "This is the start of your conversation."}
              </p>
            </div>
          )}

          {messages?.length >= count && (
            <div className="mb-3 flex justify-center">
              <Button size="sm" variant="ghost" onClick={showEarlier}>Earlier messages</Button>
            </div>
          )}
          {messages?.length > 0 && (
            <ol aria-label={`Messages with ${title}`} className="flex flex-col">
              {rows.map((row) => row.type === "msg" ? (
                <MessageRow key={row.key} row={row} chat={chat} theme={theme} latest={row.m?.id === last?.id}
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
          {receipt && <p className="mt-1 pr-1 text-right text-label text-fg-subtle">{receipt}</p>}
        </div>

        {unseen > 0 && (
          <button type="button" onClick={() => scrollToBottom(true)}
            className="press absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-4 text-caption font-semibold text-white shadow-overlay anim-rise">
            <ArrowDown size={14} aria-hidden="true" /> {plural(unseen, "new message")}
          </button>
        )}
      </div>

      {request ? (
        <div className="shrink-0 border-t border-line bg-canvas px-4 pb-4 pt-3 text-center md:px-6" role="region" aria-label="Message request">
          <p className="text-callout font-semibold">
            {chat.isGroup ? `@${chat.memberNames?.[chat.createdBy] || "Someone"} added you to this group` : `${title} wants to message you`}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-caption text-fg-muted">
            They won't know you've seen their messages until you accept. {chat.isGroup ? "Delete to leave the group." : "Delete removes it from your inbox."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            {!chat.isGroup && (
              <Button size="sm" variant="ghost" icon={Ban} loading={answering === "block"} disabled={!!answering} onClick={() => answer("block")}>Block</Button>
            )}
            <Button size="sm" icon={Trash2} loading={answering === "delete"} disabled={!!answering} onClick={() => answer("delete")}>Delete</Button>
            <Button size="sm" variant="primary" icon={Check} loading={answering === "accept"} disabled={!!answering} onClick={() => answer("accept")}>Accept</Button>
          </div>
        </div>
      ) : blockedOther ? (
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
        {photos.length > 0 && !editing && (
          <ul className="mb-2 flex gap-2 overflow-x-auto no-scrollbar" aria-label="Photos to send">
            {photos.map((p) => (
              <li key={p.id} className="relative shrink-0">
                <img src={p.url} alt="" className="h-20 w-20 rounded-control object-cover" />
                <button type="button" onClick={() => dropPhoto(p.id)} aria-label="Remove this photo" disabled={sending}
                  className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-canvas">
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {recorder.state === "recording" || voiceBusy ? (
          <div className="flex items-center gap-2" role="group" aria-label="Recording a voice message">
            <IconButton icon={Trash2} label="Discard voice message" onClick={recorder.cancel} disabled={voiceBusy} />
            <span className="flex min-h-11 flex-1 items-center gap-3 rounded-[22px] bg-surface-2 px-4">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger-text" aria-hidden="true" />
              <span className="shrink-0 tabular text-callout font-semibold" aria-live="off">
                {Math.floor(recorder.seconds / 60)}:{String(Math.floor(recorder.seconds % 60)).padStart(2, "0")}
              </span>
              <LiveBars levels={recorder.levels} />
              {recorder.seconds > MAX_VOICE_SECONDS - 10 && (
                <span className="shrink-0 text-caption text-warning-text">{Math.max(0, Math.ceil(MAX_VOICE_SECONDS - recorder.seconds))}s left</span>
              )}
            </span>
            <IconButton icon={SendHorizontal} label={voiceBusy ? "Sending voice message" : "Send voice message"} tone="primary"
              disabled={voiceBusy} onClick={finishVoice} />
          </div>
        ) : (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-1.5">
          {chat.isGroup && !editing && (
            <IconButton icon={ChartBar} label="Create a poll" tone="solid" onClick={() => setDialog("poll")} />
          )}
          {!editing && (
            <>
              <IconButton icon={ImagePlus} label="Send photos" tone="solid" onClick={() => photoInput.current?.click()} disabled={photos.length >= 10} />
              <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={pickPhotos} aria-hidden="true" tabIndex={-1} />
            </>
          )}
          {gifsEnabled && !editing && (
            <IconButton icon={Sticker} label="Send a GIF" tone="solid" onClick={() => setDialog("gif")} />
          )}
          <label htmlFor={`msg-${chat.id}`} className="sr-only">Message {title}</label>
          <MentionTextarea id={`msg-${chat.id}`} ref={inputRef} autoGrow rows={1} maxRows={6} value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value) setTyping(chat.id).catch(() => {}); }}
            onKeyDown={onKeyDown} maxLength={LIMITS.message} enterKeyHint="send"
            placeholder={editing ? "Edit your message" : "Message…"}
            className="!min-h-11 !rounded-[22px] !py-2.5" />
          {!text.trim() && !photos.length && !editing && voiceSupported() ? (
            <IconButton icon={Mic} label="Record a voice message" tone="primary" onClick={startVoice} />
          ) : (
            <IconButton type="submit" icon={editing ? Check : SendHorizontal}
              label={editing ? "Save edit" : photos.length ? `Send ${plural(photos.length, "photo")}` : "Send message"}
              tone="primary" disabled={(!text.trim() && !photos.length) || sending} />
          )}
        </form>
        )}
        {text.length > LIMITS.message * 0.9 && (
          <p className="mt-1 text-right text-caption text-warning-text tabular">{LIMITS.message - text.length} characters left</p>
        )}
      </div>
      )}

      {dialog === "info" && <ChatDetails chat={chat} onClose={() => setDialog(null)} />}
      {dialog === "poll" && <PollDialog chatId={chat.id} onClose={() => setDialog(null)} />}
      {dialog === "gif" && <GifPicker onClose={() => setDialog(null)} onPick={sendGif} />}
    </div>
  );
}
