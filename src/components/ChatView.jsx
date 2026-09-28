import {
  ArrowDown, ArrowLeft, ChartBar, Check, Info, Mic, Pencil, Phone, Reply, SendHorizontal,
  Sticker, Trash2, Video, X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { callsSupported } from "../lib/calls";
import { chatAvatar, chatTitle } from "../lib/chat";
import {
  CHAT_THEMES, clearTyping, editMessage, listenMessages, listenPresence, listenReads,
  listenTyping, me, openUserProfile, presenceLabel, sendMessage, sendVoiceMessage, setTyping,
  tsMillis,
} from "../lib/db";
import { clockTime, dayLabel, plural } from "../lib/format";
import { gifsEnabled } from "../lib/gifs";
import { checkContent } from "../lib/moderation";
import { navigate } from "../lib/router";
import { usePageTitle } from "../lib/usePageTitle";
import { LIMITS } from "../lib/validate";
import { MAX_VOICE_SECONDS, useVoiceRecorder, voiceSupported } from "../lib/voice";
import GifPicker from "./GifPicker";
import { LiveBars } from "./Voice";
import { ChatDetails } from "./chat/ChatDetails";
import { MessageRow } from "./chat/MessageRow";
import { PollDialog } from "./chat/PollDialog";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { Textarea } from "./ui/Field";
import IconButton from "./ui/IconButton";
import { Skeleton } from "./ui/States";
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
  const { inbox, blocked, startCall, inCall } = useShell();
  const recorder = useVoiceRecorder();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const stopping = useRef(false);
  const toast = useToast();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [typing, setTypingUsers] = useState([]);
  const [reads, setReads] = useState(new Map());
  const [presence, setPresence] = useState(new Map());
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [dialog, setDialog] = useState(null); // info | poll | gif
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
  usePageTitle(title, 1);
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
    // Private conversations aren't filtered for hate speech: people can block
    // and report instead. Spam checks still apply.
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

  /* Voice notes: tap the mic, talk, tap send. It stops by itself at a minute
     and sends what it has. Nothing leaves the phone until you send. */
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
          {gifsEnabled && !editing && (
            <IconButton icon={Sticker} label="Send a GIF" tone="solid" onClick={() => setDialog("gif")} />
          )}
          <label htmlFor={`msg-${chat.id}`} className="sr-only">Message {title}</label>
          <Textarea id={`msg-${chat.id}`} ref={inputRef} autoGrow rows={1} maxRows={6} value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value) setTyping(chat.id).catch(() => {}); }}
            onKeyDown={onKeyDown} maxLength={LIMITS.message} enterKeyHint="send"
            placeholder={editing ? "Edit your message" : "Message…"}
            className="!min-h-11 !rounded-[22px] !py-2.5" />
          {!text.trim() && !editing && voiceSupported() ? (
            <IconButton icon={Mic} label="Record a voice message" tone="primary" onClick={startVoice} />
          ) : (
            <IconButton type="submit" icon={editing ? Check : SendHorizontal} label={editing ? "Save edit" : "Send message"}
              tone="primary" disabled={!text.trim() || sending} />
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
