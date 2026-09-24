import { useEffect, useMemo, useRef, useState } from "react";
import {
  listenChats, listenMessages, sendMessage, searchUsers, openDirectChat,
  createGroupChat, me, timeAgo, tsMillis, isRequest, togglePin, toggleMute,
  markRead, markUnread, fetchMyReadTimes, listenTyping, setTyping, clearTyping,
  listenReads, listenPresence, presenceLabel, touchPresence,
  reactToMessage, groupReactions, QUICK_REACTIONS, canEdit, editMessage,
  unsendMessage, setChatTheme, setNickname, CHAT_THEMES, sendPoll, votePoll,
  setThought, clearThought, fetchThoughts, openUserProfile, openPost,
} from "../lib/db";
import { LIMITS } from "../lib/validate";
import { checkContent, checkName } from "../lib/moderation";
import { Avatar } from "./Nav";
import { mediaAlt } from "../lib/a11y";

const FIELD =
  "w-full min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-base " +
  "focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

const TABS = [
  ["primary", "Primary"],
  ["general", "General"],
  ["requests", "Requests"],
];

export default function Chats({ following }) {
  const [chats, setChats] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("primary");
  const [showNew, setShowNew] = useState(false);
  const [reads, setReads] = useState(new Map());

  useEffect(() => listenChats(setChats), []);
  useEffect(() => { touchPresence(); }, []);

  const chatCount = chats?.length ?? 0;
  useEffect(() => {
    if (!chatCount) return;
    fetchMyReadTimes((chats || []).map((c) => c.id)).then(setReads).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatCount]);

  const buckets = useMemo(() => {
    const out = { primary: [], general: [], requests: [] };
    for (const c of chats || []) {
      if (isRequest(c, following)) out.requests.push(c);
      else if ((c.mutedBy || []).includes(me())) out.general.push(c);
      else out.primary.push(c);
    }
    return out;
  }, [chats, following]);

  const active = chats?.find((c) => c.id === activeId);
  const pinnedCount = (chats || []).filter((c) => (c.pinnedBy || []).includes(me())).length;

  const open = async (chat) => {
    setActiveId(chat.id);
    await markRead(chat.id).catch(() => {});
    setReads((prev) => new Map(prev).set(chat.id, Date.now()));
  };

  return (
    <div className="h-full flex">
      <div className={`${active ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 flex-col border-r border-zinc-800/80`}>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-bold">Chats</h2>
          <button onClick={() => setShowNew(true)}
            className="min-h-[36px] rounded-lg bg-violet-600 hover:bg-violet-500 px-3 text-xs font-semibold">
            New
          </button>
        </div>

        <ThoughtsRail chats={chats} />

        <div role="tablist" className="flex gap-1 px-3 pb-2">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`flex-1 min-h-[34px] rounded-lg text-xs font-medium transition ${
                tab === id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-300"
              }`}>
              {label}
              {buckets[id].length > 0 && <span className="ml-1 text-[10px] opacity-70">{buckets[id].length}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {chats === null && <p className="text-sm text-zinc-400 p-4">Loading…</p>}
          {chats && buckets[tab].length === 0 && (
            <p className="text-sm text-zinc-400 px-4 py-8 text-center">
              {tab === "requests" ? "No message requests." : "Nothing here yet."}
            </p>
          )}
          {buckets[tab].map((c) => (
            <ChatRow key={c.id} chat={c} active={activeId === c.id} unread={isUnread(c, reads)}
              pinnedCount={pinnedCount} onOpen={() => open(c)}
              onChanged={() => setReads((prev) => new Map(prev))} />
          ))}
        </div>
      </div>

      {active ? (
        <ChatWindow key={active.id} chat={active} onBack={() => setActiveId(null)}
          onMarkUnread={async () => {
            await markUnread(active.id);
            setReads((prev) => new Map(prev).set(active.id, 0));
            setActiveId(null);
          }} />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-zinc-400 text-sm">
          Pick a conversation
        </div>
      )}

      {showNew && (
        <NewChatModal onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); setActiveId(id); }} />
      )}
    </div>
  );
}

function isUnread(chat, reads) {
  const readAt = reads.get(chat.id) ?? 0;
  return !!chat.lastSenderId && chat.lastSenderId !== me() && tsMillis(chat.updatedAt) > readAt;
}

function chatTitle(chat) {
  if (chat.isGroup) return chat.name || "Group chat";
  const otherId = chat.members.find((m) => m !== me());
  return "@" + (chat.nicknames?.[otherId] || chat.memberNames?.[otherId] || "unknown");
}

function ChatRow({ chat, active, unread, pinnedCount, onOpen, onChanged }) {
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const pinned = (chat.pinnedBy || []).includes(me());
  const muted = (chat.mutedBy || []).includes(me());

  return (
    <div className={`relative group ${active ? "bg-zinc-900" : ""}`}>
      <button onClick={onOpen}
        className="w-full flex items-center gap-3 px-4 py-3 pr-10 text-left transition hover:bg-zinc-900">
        <div className="relative shrink-0">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold">
            {chat.isGroup ? "◎" : chatTitle(chat)[1]?.toUpperCase()}
          </div>
          {unread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-violet-500 border-2 border-zinc-950" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate ${unread ? "font-bold text-white" : "font-semibold"}`}>
            {pinned && <span className="text-zinc-400 mr-1">▲</span>}
            {chatTitle(chat)}
            {muted && <span className="ml-1 text-zinc-400 text-xs">muted</span>}
          </p>
          <p className={`text-xs truncate ${unread ? "text-zinc-300" : "text-zinc-400"}`}>
            {chat.lastSenderId === me() && chat.lastMessage ? "You: " : ""}{chat.lastMessage || "Say hi"}
          </p>
        </div>
        <span className="text-[10px] text-zinc-400 shrink-0">{timeAgo(chat.updatedAt)}</span>
      </button>
      <button onClick={() => setMenu(true)} aria-label="Chat options"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-zinc-400 md:opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-200 transition">
        ⋯
      </button>

      {menu && (
        <Sheet title={chatTitle(chat)} onClose={() => setMenu(false)}>
          <MenuItem onClick={async () => {
            try { await togglePin(chat, pinnedCount); onChanged(); setMenu(false); }
            catch (e) { setError(e.message); }
          }}>
            {pinned ? "Unpin" : "Pin to top"}
            {!pinned && <span className="block text-xs text-zinc-400">Up to 3 chats</span>}
          </MenuItem>
          <MenuItem onClick={async () => { await toggleMute(chat); onChanged(); setMenu(false); }}>
            {muted ? "Unmute" : "Mute"}
            <span className="block text-xs text-zinc-400">
              {muted ? "Moves back to Primary" : "Moves this chat to General"}
            </span>
          </MenuItem>
          <MenuItem onClick={async () => { await markUnread(chat.id); onChanged(); setMenu(false); }}>
            Mark as unread
          </MenuItem>
          <div aria-live="polite">{error && <p className="text-sm text-red-400 px-3">{error}</p>}</div>
        </Sheet>
      )}
    </div>
  );
}

function ChatWindow({ chat, onBack, onMarkUnread }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [typing, setTypingUsers] = useState([]);
  const [reads, setReads] = useState(new Map());
  const [presence, setPresence] = useState(new Map());
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const theme = CHAT_THEMES[chat.theme] || CHAT_THEMES.default;
  const others = useMemo(() => chat.members.filter((m) => m !== me()), [chat.members]);

  useEffect(() => listenMessages(chat.id, setMessages), [chat.id]);
  useEffect(() => listenTyping(chat.id, setTypingUsers), [chat.id]);
  useEffect(() => listenReads(chat.id, setReads), [chat.id]);
  useEffect(() => listenPresence(others, (uid, at) =>
    setPresence((prev) => new Map(prev).set(uid, at))), [others]);
  useEffect(() => {
    const id = chat.id;
    return () => { clearTyping(id).catch(() => {}); };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages?.length) markRead(chat.id).catch(() => {});
  }, [messages, chat.id]);

  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (t.length > LIMITS.message) return setError("Message too long.");
    const mod = checkContent(t, { key: "msg", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setError("");
    setText("");

    try {
      if (editing) {
        await editMessage(chat.id, editing, t);
        setEditing(null);
      } else {
        await sendMessage(chat.id, t, replyTo ? {
          replyTo: { id: replyTo.id, text: replyTo.text.slice(0, 90), senderId: replyTo.senderId },
        } : {});
        setReplyTo(null);
      }
    } catch (err) {
      setError(err.message || "Couldn't send. Try again.");
    }
  };

  const presenceText = !chat.isGroup ? presenceLabel(presence.get(others[0])) : "";
  const last = messages?.[messages.length - 1];
  const seen = last && last.senderId === me() &&
    others.some((uid) => (reads.get(uid) || 0) >= tsMillis(last.createdAt));

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/80">
        <button onClick={onBack} aria-label="Back to conversations"
            className="md:hidden min-h-[44px] px-1 text-zinc-400">←</button>
        <button onClick={() => !chat.isGroup && openUserProfile(others[0])}
          className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <div className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-br ${theme.bubble} flex items-center justify-center font-bold text-sm`}>
            {chat.isGroup ? "◎" : chatTitle(chat)[1]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{chatTitle(chat)}</p>
            <p className="text-[11px] text-zinc-400 truncate">
              {typing.length > 0 ? "typing…" : chat.isGroup ? `${chat.members.length} members` : presenceText}
            </p>
          </div>
        </button>
        <button onClick={onMarkUnread} className="min-h-[36px] px-2 text-xs text-zinc-400 hover:text-zinc-200">
          Unread
        </button>
        <button onClick={() => setSettings(true)} aria-label="Chat settings"
          className="min-h-[36px] px-2 text-zinc-400 hover:text-zinc-200">⋯</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages === null && <p className="text-sm text-zinc-400">Loading…</p>}
        {messages?.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">No messages yet. Say something.</p>
        )}
        {messages?.map((m, i) => (
          <MessageRow key={m.id} msg={m} chat={chat} theme={theme} prev={messages[i - 1]}
            onReply={() => { setReplyTo(m); inputRef.current?.focus(); }}
            onEdit={() => { setEditing(m); setText(m.text); inputRef.current?.focus(); }} />
        ))}
        {typing.length > 0 && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-zinc-800 px-3.5 py-2.5">
              <span className="inline-flex gap-1">
                <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
              </span>
            </div>
          </div>
        )}
        {seen && <p className="text-[10px] text-zinc-400 text-right pr-1">Seen</p>}
        <div ref={bottomRef} />
      </div>

      {(replyTo || editing) && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800/80 bg-zinc-900/50">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-violet-400 font-medium">
              {editing ? "Editing message" : "Replying"}
            </p>
            <p className="text-xs text-zinc-400 truncate">{(editing || replyTo).text}</p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}
            aria-label="Cancel" className="min-h-[36px] px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2 p-3 border-t border-zinc-800/80 mb-14 md:mb-0">
        {chat.isGroup && (
          <button type="button" onClick={() => setShowPoll(true)} aria-label="Create poll"
            className="min-h-[44px] w-11 shrink-0 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400">◍</button>
        )}
        <input ref={inputRef} className={FIELD} value={text}
          onChange={(e) => { setText(e.target.value); setTyping(chat.id).catch(() => {}); }}
          placeholder={editing ? "Edit message…" : "Message…"} maxLength={LIMITS.message}
          aria-label="Message" />
        <button className={`min-h-[44px] shrink-0 rounded-xl bg-gradient-to-r ${theme.bubble} px-4 text-sm font-semibold`}>
          {editing ? "Save" : "Send"}
        </button>
      </form>
      <div aria-live="polite">{error && <p className="px-4 pb-2 text-sm text-red-400">{error}</p>}</div>

      {settings && <ChatSettings chat={chat} onClose={() => setSettings(false)} />}
      {showPoll && <PollComposer chatId={chat.id} onClose={() => setShowPoll(false)} />}
    </div>
  );
}

function Dot({ delay = "0s" }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: delay }} />;
}

function MessageRow({ msg, chat, theme, prev, onReply, onEdit }) {
  const [menu, setMenu] = useState(false);
  const mine = msg.senderId === me();
  const reactions = groupReactions(msg.reactions);
  const showAuthor = chat.isGroup && !mine && prev?.senderId !== msg.senderId;
  const name = chat.nicknames?.[msg.senderId] || chat.memberNames?.[msg.senderId] || "?";

  if (msg.deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <p className="text-xs text-zinc-400 italic px-3.5 py-2">Message unsent</p>
      </div>
    );
  }

  return (
    <>
      <div className={`flex ${mine ? "justify-end" : "justify-start"} anim-fade`}>
        <div className={`max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
          {showAuthor && <p className="text-[10px] font-semibold text-violet-300 mb-0.5 px-1">@{name}</p>}

          {msg.replyTo && (
            <div className="mb-0.5 max-w-full truncate rounded-lg border-l-2 border-zinc-600 bg-zinc-800/50 px-2 py-1 text-[11px] text-zinc-400">
              {msg.replyTo.text}
            </div>
          )}

          <button onDoubleClick={() => reactToMessage(chat.id, msg, "❤️")}
            onClick={() => setMenu(true)}
            className={`text-left rounded-2xl px-3.5 py-2 text-sm ${
              mine ? `bg-gradient-to-r ${theme.bubble} rounded-br-md` : "bg-zinc-800 rounded-bl-md"
            }`}>
            {msg.poll && <PollView chatId={chat.id} msg={msg} />}
            {msg.sharedPost && <SharedPostCard post={msg.sharedPost} />}
            {!msg.poll && msg.text && (
              <p className="break-words whitespace-pre-wrap">{msg.text}</p>
            )}
            {msg.editedAt && <span className="ml-1.5 text-[10px] opacity-60">edited</span>}
          </button>

          {reactions.length > 0 && (
            <div className={`flex gap-1 -mt-1.5 ${mine ? "mr-1" : "ml-1"}`}>
              {reactions.map((r) => (
                <button key={r.emoji} onClick={() => reactToMessage(chat.id, msg, r.emoji)}
                  className={`rounded-full border bg-zinc-900 px-1.5 py-0.5 text-[11px] ${
                    r.mine ? "border-violet-500" : "border-zinc-700"
                  }`}>
                  {r.emoji}{r.uids.length > 1 && ` ${r.uids.length}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {menu && (
        <Sheet title="Message" onClose={() => setMenu(false)}>
          <div className="flex gap-1 pb-3">
            {QUICK_REACTIONS.map((e) => (
              <button key={e} onClick={() => { reactToMessage(chat.id, msg, e); setMenu(false); }}
                aria-label={`React ${e}`}
                className="h-11 w-11 rounded-full hover:bg-zinc-800 text-xl">{e}</button>
            ))}
          </div>
          <MenuItem onClick={() => { onReply(); setMenu(false); }}>Reply</MenuItem>
          {canEdit(msg) && <MenuItem onClick={() => { onEdit(); setMenu(false); }}>
            Edit
            <span className="block text-xs text-zinc-400">Within 15 minutes of sending</span>
          </MenuItem>}
          {mine && (
            <MenuItem danger onClick={async () => { await unsendMessage(chat.id, msg); setMenu(false); }}>
              Unsend
              <span className="block text-xs text-zinc-400">Removes it for everyone</span>
            </MenuItem>
          )}
        </Sheet>
      )}
    </>
  );
}

/* A shared post renders as a real preview card that opens the full post,
   rather than a line of text saying something was shared. */
function SharedPostCard({ post }) {
  const isVideo = post.mediaType?.startsWith("video/");
  const kindLabel = post.kind === "short" ? "Flick" : post.kind === "video" ? "Feature" : "Post";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); openPost(post.id); }}
      className="block w-[220px] overflow-hidden rounded-xl border border-white/20 bg-black/25 text-left transition hover:border-white/40">
      {post.mediaUrl ? (
        <div className="relative aspect-[4/3] bg-black">
          {isVideo ? (
            <>
              <video src={post.mediaUrl} preload="none" muted playsInline
                className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl text-white/85">▶</span>
            </>
          ) : (
            <img src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <div className="flex aspect-[5/2] items-center justify-center bg-white/5 px-3">
          <p className="line-clamp-3 text-[11px] leading-snug opacity-90">{post.text || "View post"}</p>
        </div>
      )}
      <div className="px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-wide opacity-60">{kindLabel}</p>
        <p className="text-xs font-semibold truncate">
          {post.title || post.text || `@${post.authorName}`}
        </p>
        <p className="text-[10px] opacity-70 truncate">@{post.authorName}</p>
      </div>
    </button>
  );
}

function PollView({ chatId, msg }) {
  const votes = msg.poll.votes || {};
  const total = Object.keys(votes).length;
  const mine = votes[me()];
  return (
    <div className="min-w-[200px]">
      <p className="font-semibold mb-2">{msg.poll.question}</p>
      <div className="space-y-1.5">
        {msg.poll.options.map((o, i) => {
          const count = Object.values(votes).filter((v) => v === i).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <button key={i} onClick={(e) => { e.stopPropagation(); votePoll(chatId, msg, i); }}
              className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                mine === i ? "border-white/70" : "border-white/25"
              }`}>
              <span className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${pct}%` }} />
              <span className="relative flex justify-between gap-2">
                <span>{o.text}</span><span className="opacity-70">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] opacity-60">{total} vote{total === 1 ? "" : "s"}</p>
    </div>
  );
}

function PollComposer({ chatId, onClose }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (q.length < 3) return setError("Give the poll a question.");
    if (opts.length < 2) return setError("Add at least two options.");
    const mod = checkContent([q, ...opts].join("\n"), { key: "poll", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    await sendPoll(chatId, q, opts);
    onClose();
  };

  return (
    <Sheet title="New poll" onClose={onClose}>
      <form onSubmit={submit} className="space-y-2">
        <input className={FIELD} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask something…" maxLength={120} autoFocus aria-label="Poll question" />
        {options.map((o, i) => (
          <input key={i} className={FIELD} value={o} maxLength={60} aria-label={`Option ${i + 1}`}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        {options.length < 4 && (
          <button type="button" onClick={() => setOptions([...options, ""])}
            className="text-xs text-violet-400 hover:text-violet-300">+ Add option</button>
        )}
        <div aria-live="polite">{error && <p className="text-sm text-red-400">{error}</p>}</div>
        <button className="w-full min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold">
          Post poll
        </button>
      </form>
    </Sheet>
  );
}

function ChatSettings({ chat, onClose }) {
  const others = chat.members.filter((m) => m !== me());
  const [nick, setNick] = useState("");
  const [target, setTarget] = useState(others[0] || "");
  const [msg, setMsg] = useState("");

  return (
    <Sheet title="Chat settings" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-xs text-zinc-400 mb-2">Theme</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CHAT_THEMES).map(([id, t]) => (
              <button key={id} onClick={() => setChatTheme(chat.id, id)} aria-label={t.label}
                className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.bubble} ${
                  chat.theme === id ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : ""
                }`} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-zinc-400 mb-2">Nickname</p>
          {chat.isGroup && (
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              className={`${FIELD} mb-2`} aria-label="Who to nickname">
              {others.map((uid) => (
                <option key={uid} value={uid}>@{chat.memberNames?.[uid] || uid.slice(0, 6)}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input className={FIELD} value={nick} onChange={(e) => setNick(e.target.value)}
              placeholder={chat.nicknames?.[target] || "Set a nickname"} maxLength={30}
              aria-label="Nickname" />
            <button onClick={async () => {
              const check = checkName(nick);
              if (check.error) return setMsg(check.error);
              await setNickname(chat.id, target, nick.trim());
              setNick("");
              setMsg("Saved.");
            }} className="min-h-[44px] shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
              Save
            </button>
          </div>
          <p aria-live="polite" className="mt-1 text-[11px] text-zinc-400">
            {msg || "Only shown inside this chat."}
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/* 60-character notes that sit above the inbox for 24 hours. */
function ThoughtsRail({ chats }) {
  const [thoughts, setThoughts] = useState([]);
  const [mine, setMine] = useState(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const chatCount = chats?.length ?? 0;

  const load = async () => {
    const uids = [me(), ...(chats || []).flatMap((c) => c.members)].filter(Boolean);
    const list = await fetchThoughts([...new Set(uids)]).catch(() => []);
    setThoughts(list.filter((n) => n.uid !== me()));
    setMine(list.find((n) => n.uid === me()) || null);
  };

  useEffect(() => {
    if (chats) (async () => { await load(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatCount]);

  const save = async () => {
    const t = text.trim();
    if (t) {
      const mod = checkContent(t, { key: "thought", skipCooldown: true });
      if (mod.error) return setError(mod.error);
      await setThought(t);
    } else {
      await clearThought();
    }
    setEditing(false);
    setText("");
    setError("");
    load();
  };

  return (
    <div className="px-3 pb-2">
      <div className="flex gap-3 overflow-x-auto no-scrollbar">
        <button onClick={() => { setEditing(true); setText(mine?.text || ""); }}
          className="flex flex-col items-center gap-1 shrink-0 w-16">
          <div className="relative">
            <div className="h-11 w-11 rounded-full bg-zinc-800 flex items-center justify-center text-base">🙂</div>
            <span className="absolute -top-1 -right-2 max-w-[64px] truncate rounded-full bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-300">
              {mine?.text || "Thought"}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400">You</span>
        </button>
        {thoughts.map((n) => (
          <div key={n.uid} className="flex flex-col items-center gap-1 shrink-0 w-16">
            <div className="relative">
              <Avatar profile={{ username: n.username }} size={12} className="h-11 w-11" />
              <span className="absolute -top-1 -right-2 max-w-[64px] truncate rounded-full bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-300">
                {n.text}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 truncate w-full text-center">@{n.username}</span>
          </div>
        ))}
      </div>

      {editing && (
        <Sheet title="Your thought" onClose={() => setEditing(false)}>
          <p className="text-xs text-zinc-400 mb-2">Up to 60 characters. Disappears after 24 hours.</p>
          <input className={FIELD} value={text} onChange={(e) => setText(e.target.value)}
            maxLength={60} autoFocus placeholder="What's on your mind?" aria-label="Thought" />
          <div aria-live="polite">{error && <p className="text-sm text-red-400 mt-2">{error}</p>}</div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setText(""); save(); }}
              className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold">
              Clear
            </button>
            <button onClick={save}
              className="flex-1 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold">
              Share thought
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function NewChatModal({ onClose, onCreated }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 2) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => u.id !== me() && !selected.some((s) => s.id === u.id)));
      } else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [term, selected]);

  const start = async () => {
    setError("");
    if (!selected.length) return setError("Pick at least one person.");
    setBusy(true);
    try {
      if (selected.length === 1) onCreated(await openDirectChat(selected[0]));
      else {
        const name = groupName.trim() || selected.map((s) => s.username).slice(0, 3).join(", ");
        const check = checkName(name);
        if (check.error) { setBusy(false); return setError(check.error); }
        onCreated(await createGroupChat(name.slice(0, LIMITS.chatName.max), selected));
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't start the chat.");
      setBusy(false);
    }
  };

  return (
    <Sheet title="New message" onClose={onClose}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((u) => (
            <button key={u.id} onClick={() => setSelected(selected.filter((s) => s.id !== u.id))}
              className="rounded-full bg-violet-600/20 text-violet-300 px-3 py-1 text-xs font-medium">
              @{u.username} ✕
            </button>
          ))}
        </div>
      )}
      <input className={FIELD} placeholder="Search handles…" value={term} autoFocus
        onChange={(e) => setTerm(e.target.value)} aria-label="Search people" />
      <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
        {results.map((u) => (
          <button key={u.id} onClick={() => { setSelected([...selected, u]); setTerm(""); }}
            className="w-full flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-zinc-800 text-left">
            <Avatar profile={u} size={7} />
            <span className="text-sm">
              {u.name || u.username}<span className="text-zinc-400 ml-1.5">@{u.username}</span>
            </span>
          </button>
        ))}
      </div>
      {selected.length > 1 && (
        <input className={`${FIELD} mt-2`} placeholder="Group name" value={groupName}
          onChange={(e) => setGroupName(e.target.value)} maxLength={LIMITS.chatName.max}
          aria-label="Group name" />
      )}
      <div aria-live="polite">{error && <p className="text-sm text-red-400 mt-2">{error}</p>}</div>
      <button onClick={start} disabled={busy}
        className="mt-3 w-full min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-sm font-semibold">
        {selected.length > 1 ? "Start group chat" : "Start chat"}
      </button>
    </Sheet>
  );
}

function MenuItem({ onClick, disabled, danger, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full text-left rounded-xl px-3 py-2.5 text-sm transition disabled:opacity-50 ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-zinc-800"
      }`}>
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 anim-fade"
      role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[75vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 p-4 anim-rise">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[36px] px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
