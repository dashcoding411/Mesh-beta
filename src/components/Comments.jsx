import { useEffect, useRef, useState } from "react";
import { MessageCircle, SendHorizontal, Trash2, Lock } from "lucide-react";
import { fetchComments, addComment, deleteComment, openUserProfile, me } from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent } from "../lib/moderation";
import { shortTime, fullTime, isoTime } from "../lib/format";
import Dialog from "./ui/Dialog";
import Avatar from "./ui/Avatar";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import { Textarea } from "./ui/Field";
import { Skeleton, EmptyState, ErrorState, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* Comments open as a sheet over the post, with the box pinned to the bottom
   where a thumb already is. What you typed survives a failed send. */
export default function Comments({ post, onClose, onCountChange }) {
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  const submit = async (e) => {
    e?.preventDefault();
    const v = validateText(text, LIMITS.comment, "Comment");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "comment", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try {
      const c = await addComment(post, v.text);
      setComments((prev) => [...(prev || []), c]);
      setText("");
      onCountChange?.(1);
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("Couldn't post your comment. It's still here, so try again.");
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
      footer={post.locked ? (
        <p className="flex items-center justify-center gap-2 text-callout text-warning-text">
          <Lock size={16} aria-hidden="true" /> A moderator has paused comments on this post.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex items-end gap-2">
            <label htmlFor="comment-box" className="sr-only">Add a comment</label>
            <Textarea id="comment-box" ref={inputRef} autoGrow rows={1} maxRows={5} value={text}
              onChange={(e) => { setText(e.target.value); if (error) setError(""); }} onKeyDown={onKey}
              placeholder={`Reply to @${post.authorName}…`} maxLength={LIMITS.comment}
              aria-invalid={error ? "true" : undefined} aria-describedby={error ? "comment-error" : undefined}
              className="min-h-11" />
            <IconButton type="submit" icon={SendHorizontal} label="Post comment" tone="primary"
              disabled={busy || !text.trim()} />
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
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-3 px-5 py-3">
              <button type="button" onClick={() => c.authorId && openUserProfile(c.authorId)} className="h-fit shrink-0"
                aria-label={`@${c.authorName}'s profile`}>
                <Avatar profile={{ name: c.authorDisplayName, username: c.authorName, photoURL: c.authorPhoto }} size={32} />
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
                <RichText text={c.text} className="mt-0.5 text-callout text-fg" />
              </div>
              {(c.authorId === me() || isAuthor) && c.id && (
                <IconButton icon={Trash2} label="Delete comment" size={16} className="-mr-2 shrink-0 opacity-70 hover:opacity-100"
                  onClick={() => remove(c)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={listEnd} />
    </Dialog>
  );
}
