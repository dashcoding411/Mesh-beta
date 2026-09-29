import { useEffect, useRef, useState } from "react";
import { MessageCircle, SendHorizontal, Trash2, Lock, Sticker, X, Flag, EyeOff } from "lucide-react";
import ReportDialog from "./ReportDialog";
import { gifsEnabled } from "../lib/gifs";
import GifPicker, { GifView } from "./GifPicker";
import { fetchComments, addComment, deleteComment, openUserProfile, fetchProfile, me } from "../lib/db";
import { useShell } from "./shell/ShellContext";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent, assessText, hitsHiddenWords, markPosted } from "../lib/moderation";
import { shortTime, fullTime, isoTime } from "../lib/format";
import Dialog from "./ui/Dialog";
import LiveAvatar from "./ui/LiveAvatar";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import { Textarea } from "./ui/Field";
import { Skeleton, EmptyState, ErrorState, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* Comments open as a sheet over the post, with the box pinned to the bottom
   where a thumb already is. What you typed survives a failed send. */
export default function Comments({ post, onClose, onCountChange, onAdded }) {
  const toast = useToast();
  const { hiddenAuthors, hiddenWords } = useShell();
  const [reporting, setReporting] = useState(null);
  const [revealed, setRevealed] = useState(new Set());
  const [closedReason, setClosedReason] = useState("");
  const [comments, setComments] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [gif, setGif] = useState(null);
  const [picking, setPicking] = useState(false);
  const listEnd = useRef(null);
  const inputRef = useRef(null);
  const isAuthor = post.authorId === me();

  const load = () => {
    setLoadError(false);
    setComments(null);
    fetchComments(post.id).then(setComments).catch(() => setLoadError(true));
  };
  useEffect(() => {
    fetchComments(post.id).then(setComments).catch(() => setLoadError(true));
  }, [post.id]);

  // The author decides who can comment (enforced by the rules as well).
  useEffect(() => {
    if (post.authorId === me()) return;
    fetchProfile(post.authorId).then((author) => {
      // "Only people they follow" is decided by the server when you post;
      // a refusal comes back with that reason.
      if ((author?.commentPolicy || "everyone") === "off") setClosedReason(`@${post.authorName} has turned comments off.`);
    }).catch(() => {});
  }, [post.authorId, post.authorName]);

  const submit = async (e) => {
    e?.preventDefault();
    const v = validateText(text, LIMITS.comment, "Comment");
    if (v.error) return setError(v.error);
    if (!v.text && !gif) return;
    let flagged = null;
    if (v.text) {
      const mod = checkContent(v.text, { key: "comment", allowQuoted: true });
      if (mod.error) return setError(mod.error);
      if (mod.sensitive) flagged = mod;
    }
    setBusy(true);
    setError("");
    try {
      const c = await addComment(post, v.text, gif && { url: gif.url, width: gif.width, height: gif.height, title: gif.title }, !!flagged);
      markPosted("comment", v.text);
      setComments((prev) => [...(prev || []), c]);
      setText("");
      setGif(null);
      onCountChange?.(1);
      onAdded?.(c);
      if (flagged) toast({ tone: "info", title: "Posted", body: flagged.quoted ? "Others will see a warning and tap to read it, as it quotes offensive language." : "It may be folded away for others, as it could come across as mocking a group." });
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? `@${post.authorName} only takes comments from people they follow.`
        : "Couldn't post your comment. It's still here, so try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    const prev = comments;
    setComments((list) => list.filter((x) => x.id !== c.id));
    onCountChange?.(-1);
    try {
      await deleteComment(post, c.id);
      toast({ title: "Comment deleted" });
    } catch {
      setComments(prev);
      onCountChange?.(1);
      toast({ tone: "error", title: "Couldn't delete that comment" });
    }
  };

  const onKey = (e) => {
    // Enter posts on a keyboard; on a phone the Post button does, and Enter is a new line.
    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      submit();
    }
  };

  const count = comments?.length ?? post.commentCount ?? 0;

  return (
    <Dialog title={count ? `Comments (${count})` : "Comments"} onClose={onClose} size="lg" initialFocusRef={inputRef}
      bodyClassName="!px-0"
      footer={post.locked || closedReason ? (
        <p className="flex items-center justify-center gap-2 text-callout text-fg-muted">
          <Lock size={16} aria-hidden="true" /> {post.locked ? "A moderator has paused comments on this post." : closedReason}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {gif && (
            <div className="relative w-28">
              <GifView gif={gif} />
              <IconButton icon={X} label="Remove GIF" tone="overlay" size={16} className="absolute -right-1 -top-1" onClick={() => setGif(null)} />
            </div>
          )}
          <div className="flex items-end gap-2">
            {gifsEnabled && <IconButton icon={Sticker} label="Add a GIF" className="-ml-2 shrink-0" onClick={() => setPicking(true)} />}
            <label htmlFor="comment-box" className="sr-only">Add a comment</label>
            <Textarea id="comment-box" ref={inputRef} autoGrow rows={1} maxRows={5} value={text}
              onChange={(e) => { setText(e.target.value); if (error) setError(""); }} onKeyDown={onKey}
              placeholder={`Reply to @${post.authorName}…`} maxLength={LIMITS.comment}
              aria-invalid={error ? "true" : undefined} aria-describedby={error ? "comment-error" : undefined}
              className="min-h-11" />
            <IconButton type="submit" icon={SendHorizontal} label="Post comment" tone="primary"
              disabled={busy || (!text.trim() && !gif)} />
          </div>
          <div aria-live="polite"><InlineMessage id="comment-error">{error}</InlineMessage></div>
        </form>
      )}>
      {loadError && <ErrorState compact title="Couldn't load comments" onRetry={load} />}
      {!loadError && comments === null && (
        <div className="space-y-4 px-5 py-2" role="status" aria-label="Loading comments">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 !rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-3/4" /></div>
            </div>
          ))}
        </div>
      )}
      {comments?.length === 0 && (
        <EmptyState compact icon={MessageCircle} title="No comments yet"
          body={post.locked ? "Comments are paused on this post." : "Start the conversation. Say what you think."} />
      )}
      {comments?.length > 0 && (
        <ul className="divide-y divide-line">
          {comments.filter((c) => !hiddenAuthors.has(c.authorId)).map((c) => {
            // Folded, not deleted: what might offend (or matches a word you've
            // hidden) waits behind a tap. Your own comments are never folded for you.
            const level = c.authorId === me() || revealed.has(c.id) ? "ok" : assessText(c.text).level;
            const why = c.authorId === me() || revealed.has(c.id) ? ""
              : hitsHiddenWords(c.text, hiddenWords) ? "Contains a word you've hidden"
              : level === "quoted" ? "Quotes offensive language, to report or call it out"
              : level === "block" ? "May break the Community Guidelines"
              : level === "borderline" ? "Hidden because it may come across as mocking a group" : "";
            if (why) {
              return (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-caption text-fg-subtle">
                  <EyeOff size={16} aria-hidden="true" />
                  <span className="flex-1">{why}</span>
                  <button type="button" onClick={() => setRevealed((r) => new Set(r).add(c.id))}
                    className="min-h-9 rounded-full px-3 font-semibold text-accent-text hover:bg-surface-2">Show</button>
                </li>
              );
            }
            return (
            <li key={c.id} className="group flex gap-3 px-5 py-3">
              <button type="button" onClick={() => c.authorId && openUserProfile(c.authorId)} className="h-fit shrink-0"
                aria-label={`@${c.authorName}'s profile`}>
                <LiveAvatar uid={c.authorId} profile={{ name: c.authorDisplayName, username: c.authorName, photoURL: c.authorPhoto }} size={32} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5">
                  <button type="button" onClick={() => c.authorId && openUserProfile(c.authorId)}
                    className="truncate text-callout font-semibold hover:underline">
                    {c.authorDisplayName || `@${c.authorName}`}
                  </button>
                  {c.authorId === post.authorId && (
                    <span className="rounded bg-surface-3 px-1.5 text-label font-semibold text-fg-muted">Author</span>
                  )}
                  <time dateTime={isoTime(c.createdAt)} title={fullTime(c.createdAt)} className="shrink-0 text-caption text-fg-subtle">
                    {shortTime(c.createdAt)}
                  </time>
                </p>
                {c.text && <RichText text={c.text} className="mt-0.5 text-callout text-fg" />}
                {c.gif && <GifView gif={c.gif} className="mt-1.5 max-w-[220px]" />}
              </div>
              {(c.authorId === me() || isAuthor) && c.id && (
                <IconButton icon={Trash2} label="Delete comment" size={16} className="-mr-2 shrink-0 opacity-70 hover:opacity-100"
                  onClick={() => remove(c)} />
              )}
              {c.authorId !== me() && c.id && (
                <IconButton icon={Flag} label={`Report @${c.authorName}'s comment`} size={16}
                  className="-mr-2 shrink-0 opacity-60 hover:opacity-100" onClick={() => setReporting(c)} />
              )}
            </li>
            );
          })}
        </ul>
      )}
      <div ref={listEnd} />
      {reporting && (
        <ReportDialog onClose={() => setReporting(null)}
          target={{ type: "comment", id: reporting.id, authorId: reporting.authorId, postId: post.id, text: reporting.text }} />
      )}
      {picking && <GifPicker onClose={() => setPicking(false)} onPick={(g) => { setGif(g); setPicking(false); }} />}
    </Dialog>
  );
}
