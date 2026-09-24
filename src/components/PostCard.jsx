import { useEffect, useState } from "react";
import { auth } from "../firebase";
import {
  timeAgo, toggleLike, deletePost, openUserProfile, toggleSave, sendPostTo,
  hidePost, reportPost, REPORT_REASONS, listenChats, me,
} from "../lib/db";
import { Avatar } from "./Nav";
import { mediaAlt } from "../lib/a11y";
import Comments from "./Comments";

export default function PostCard({
  post, liked, onLikedChange, onDeleted, canModerate = false,
  saved: savedProp = false, onSavedChange,
}) {
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [saveCount, setSaveCount] = useState(post.saveCount || 0);
  const [sendCount, setSendCount] = useState(post.sendCount || 0);
  const [saved, setSaved] = useState(savedProp);
  const [showComments, setShowComments] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(false);
  const mine = post.authorId === auth.currentUser?.uid;
  const removable = mine || canModerate;

  const handleLike = async () => {
    if (busy) return;
    setBusy(true);
    setPulse(true);
    try {
      await toggleLike(post, liked);
      setLikeCount((c) => c + (liked ? -1 : 1));
      onLikedChange(post.id, !liked);
    } finally {
      setBusy(false);
      setTimeout(() => setPulse(false), 400);
    }
  };

  const handleSave = async () => {
    const next = !saved;
    setSaved(next);
    setSaveCount((c) => c + (next ? 1 : -1));
    try {
      await toggleSave(post, saved);
      onSavedChange?.(post.id, next);
    } catch (err) {
      console.error(err);
      setSaved(!next);
      setSaveCount((c) => c + (next ? -1 : 1));
    }
  };

  const handleDelete = async () => {
    if (!confirm(mine ? "Delete this post? This can't be undone." : "Remove this post from the circle?")) return;
    await deletePost(post);
    onDeleted?.(post.id);
  };

  const isVideo = post.mediaType?.startsWith("video/");

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden transition-all duration-300 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/40">
      <div className="flex items-center justify-between px-4 py-3">
        <button className="flex items-center gap-3 text-left min-w-0 flex-1" onClick={() => openUserProfile(post.authorId)}>
          <Avatar profile={{ username: post.authorName, photoURL: post.authorPhoto }} size={9} />
          <div className="min-w-0">
            <p className="text-sm font-semibold hover:text-violet-300 transition truncate">
              {post.authorDisplayName || post.authorName}
              <span className="ml-1.5 font-normal text-zinc-400">@{post.authorName}</span>
            </p>
            <p className="text-xs text-zinc-400">
              {timeAgo(post.createdAt)}
              {post.kind !== "post" && (
                <span className="ml-2 uppercase text-[10px] tracking-wide text-violet-400">{post.kind}</span>
              )}
              {post.visibility === "followers" && (
                <span className="ml-2 text-[10px] text-zinc-400">followers only</span>
              )}
            </p>
          </div>
        </button>
        {removable && (
          <button onClick={handleDelete} className="shrink-0 text-xs text-zinc-400 hover:text-red-400 min-h-[36px] px-1">
            {mine ? "Delete" : "Remove"}
          </button>
        )}
      </div>

      {post.title && <h3 className="px-4 pb-2 font-bold">{post.title}</h3>}
      {post.text && <p className="px-4 pb-3 text-sm text-zinc-200 whitespace-pre-wrap break-words">{post.text}</p>}

      {post.mediaUrl &&
        (isVideo ? (
          <video src={post.mediaUrl} controls playsInline preload="metadata" className="w-full max-h-[70vh] bg-black" />
        ) : (
          <img src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" className="w-full max-h-[70vh] object-contain bg-black" />
        ))}

      <div className="flex items-center gap-1 px-2 py-2 text-sm text-zinc-400">
        <Action onClick={handleLike} active={liked} activeClass="text-fuchsia-400"
          label={`${liked ? "Unlike" : "Like"}${count(likeCount, "like")}`}>
          <span className={pulse ? "anim-heart inline-block" : "inline-block"}>{liked ? "♥" : "♡"}</span>
          {likeCount > 0 && <span>{likeCount}</span>}
        </Action>
        <Action onClick={() => setShowComments(true)} label={`Comments${count(commentCount, "comment")}`}>
          <span>◗</span>{commentCount > 0 && <span>{commentCount}</span>}
        </Action>
        <Action onClick={handleSave} active={saved} activeClass="text-violet-300"
          label={`${saved ? "Remove from saved" : "Save"}${count(saveCount, "save")}`}>
          <span>{saved ? "★" : "☆"}</span>{saveCount > 0 && <span>{saveCount}</span>}
        </Action>
        <Action onClick={() => setShowSend(true)} label={`Send to someone${count(sendCount, "send")}`}>
          <span>↗</span>{sendCount > 0 && <span>{sendCount}</span>}
        </Action>
        <div className="flex-1" />
        <Action onClick={() => setShowMenu(true)} label="More options">⋯</Action>
      </div>

      {showComments && (
        <Comments
          post={post}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => setCommentCount((c) => c + 1)}
        />
      )}
      {showSend && <SendSheet post={post} onClose={() => setShowSend(false)} onSent={() => setSendCount((c) => c + 1)} />}
      {showMenu && (
        <PostMenu post={post} mine={mine} onClose={() => setShowMenu(false)}
          onHidden={() => onDeleted?.(post.id)} onReport={() => setShowReport(true)} />
      )}
      {showReport && (
        <ReportSheet post={post} onClose={() => setShowReport(false)} onReported={() => onDeleted?.(post.id)} />
      )}
    </article>
  );
}

/* aria-label replaces an element's visible text for screen readers, so the
   counts sitting next to each glyph have to be folded into the label — or a
   screen reader announces "Like" and never mentions the 42. */
function count(n, noun) {
  return n > 0 ? ` — ${n} ${noun}${n === 1 ? "" : "s"}` : "";
}

function Action({ onClick, active, activeClass = "", label, children }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active}
      className={`flex items-center gap-1.5 min-h-[40px] px-2.5 rounded-lg transition hover:bg-zinc-800/60 ${
        active ? activeClass : "hover:text-zinc-100"
      }`}>
      {children}
    </button>
  );
}

/* Sending a post to a specific person is the strongest signal in the ranker,
   so it gets a real destination picker rather than a copy-link button. */
function SendSheet({ post, onClose, onSent }) {
  const [chats, setChats] = useState(null);
  const [sent, setSent] = useState(new Set());
  const [busy, setBusy] = useState("");

  useEffect(() => listenChats(setChats), []);

  const send = async (chat) => {
    setBusy(chat.id);
    try {
      await sendPostTo(post, chat.id);
      setSent((prev) => new Set(prev).add(chat.id));
      onSent();
    } catch (err) {
      console.error(err);
    } finally { setBusy(""); }
  };

  return (
    <Sheet title="Send to" onClose={onClose}>
      {chats === null && <p className="text-sm text-zinc-400">Loading…</p>}
      {chats?.length === 0 && (
        <p className="text-sm text-zinc-400">
          No conversations yet. Start one from Chats or someone's profile.
        </p>
      )}
      <div className="space-y-1">
        {chats?.map((c) => {
          const otherId = c.members.find((m) => m !== me());
          const title = c.isGroup ? c.name || "Group chat" : `@${c.memberNames?.[otherId] || "unknown"}`;
          return (
            <button key={c.id} onClick={() => send(c)} disabled={busy === c.id || sent.has(c.id)}
              className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-800 disabled:opacity-60 text-left">
              <span className="text-sm truncate">{title}</span>
              <span className={`text-xs shrink-0 ${sent.has(c.id) ? "text-emerald-400" : "text-violet-400"}`}>
                {sent.has(c.id) ? "Sent" : busy === c.id ? "…" : "Send"}
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function PostMenu({ post, mine, onClose, onHidden, onReport }) {
  const [busy, setBusy] = useState(false);

  const hide = async () => {
    setBusy(true);
    try {
      await hidePost(post);
      onClose();
      onHidden();
    } catch (err) { console.error(err); setBusy(false); }
  };

  return (
    <Sheet title="Options" onClose={onClose}>
      <div className="space-y-1">
        {!mine && (
          <>
            <MenuItem onClick={hide} disabled={busy}>
              Not interested
              <span className="block text-xs text-zinc-400">Show me less like this</span>
            </MenuItem>
            <MenuItem onClick={() => { onClose(); onReport(); }} danger>
              Report post
            </MenuItem>
          </>
        )}
        {mine && <p className="text-sm text-zinc-400 px-3 py-2">Use Delete on the post to remove it.</p>}
      </div>
    </Sheet>
  );
}

function ReportSheet({ post, onClose, onReported }) {
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(false);

  const file = async (reason) => {
    setBusy(reason.id);
    try {
      await reportPost(post, reason.id);
      setDone(true);
      setTimeout(() => { onClose(); onReported(); }, 1200);
    } catch (err) {
      console.error(err);
      setBusy("");
    }
  };

  return (
    <Sheet title="Report post" onClose={onClose}>
      {done ? (
        <p className="text-sm text-emerald-400 px-3 py-4">
          Thanks — this has been sent for review and hidden from your feed.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-400 px-3 pb-2">What's wrong with this post?</p>
          <div className="space-y-1">
            {REPORT_REASONS.map((r) => (
              <MenuItem key={r.id} onClick={() => file(r)} disabled={!!busy}>
                {r.label}
              </MenuItem>
            ))}
          </div>
        </>
      )}
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
        className="w-full max-w-sm max-h-[70vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 p-4 anim-rise">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[36px] px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
