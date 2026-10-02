import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { openUserProfile, me, fetchLikers, fetchTopComment, addComment } from "../../lib/db";
import { compact as compactNum, plural } from "../../lib/format";
import { LIMITS, validateText } from "../../lib/validate";
import { checkContent, isBorderline, hitsHiddenWords, markPosted } from "../../lib/moderation";
import { useShell } from "../shell/ShellContext";
import Avatar from "../ui/Avatar";
import RichText from "../ui/RichText";
import { useToast } from "../ui/toast-context";

// Truncated after ~2 lines with a "more" toggle.
export function Caption({ post, highlight }) {
  const [open, setOpen] = useState(false);
  const text = post.text || "";
  const long = text.length > 125 || text.split("\n").length > 2;
  const shown = open || !long ? text : `${text.slice(0, 110).split("\n").slice(0, 2).join("\n").trimEnd()}…`;
  return (
    <div className="text-callout leading-6 text-fg">
      {post.title && <p className="font-semibold">{post.title}</p>}
      {text && (
        <p className="whitespace-pre-wrap break-words">
          <button type="button" onClick={() => openUserProfile(post.authorId)} className="mr-1.5 font-semibold hover:opacity-70">{post.authorName}</button>
          <RichText as="span" text={shown} highlight={highlight} className="inline" />
          {long && !open && (
            <button type="button" onClick={() => setOpen(true)} className="ml-1 text-fg-subtle hover:text-fg">more</button>
          )}
        </p>
      )}
    </div>
  );
}

export function Action({ icon: Icon, label, count, noun, pressed, activeClass = "text-accent-text", noFill, disabled, onClick, className = "" }) {
  const name = count > 0 && noun ? `${label}, ${plural(count, noun)}` : label;
  return (
    <button type="button" onClick={onClick} aria-label={name} title={label}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined} aria-disabled={disabled || undefined}
      className={`press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2 transition-opacity hover:opacity-60
        ${pressed ? activeClass : "text-fg"} ${disabled ? "opacity-40" : ""} ${className}`}>
      <Icon size={25} strokeWidth={1.9} aria-hidden="true" fill={pressed && !noFill ? "currentColor" : "none"} />
      {count > 0 && <span aria-hidden="true" className="tabular text-callout font-semibold">{compactNum(count)}</span>}
    </button>
  );
}

// Likers, caption, top comment and counts. Save/send counts are author-only.
export function SocialProof({ post, counts, seen, hiddenAuthors, mine, hiddenWords, preview, onOpenComments, caption, tags, compact }) {
  const [likers, setLikers] = useState([]);
  const [top, setTop] = useState(null);
  const wantLikers = seen && !compact && counts.like > 0;
  const wantTop = seen && !compact && (post.commentCount || 0) > 0;

  useEffect(() => {
    if (!wantLikers) return;
    let alive = true;
    fetchLikers(post.id, 2).then((l) => { if (alive) setLikers(l); }).catch(() => {});
    return () => { alive = false; };
  }, [wantLikers, post.id]);
  useEffect(() => {
    if (!wantTop) return;
    let alive = true;
    fetchTopComment(post.id).then((c) => { if (alive) setTop(c); }).catch(() => {});
    return () => { alive = false; };
  }, [wantTop, post.id]);

  const shownLiker = likers.find((l) => !hiddenAuthors.has(l.id) && l.id !== me());
  // Stricter than the comment sheet: no borderline or hidden-word matches.
  const topOk = top && !hiddenAuthors.has(top.authorId) && !isBorderline(top.text) && !hitsHiddenWords(top.text, hiddenWords);
  const comment = preview || (topOk ? top : null);
  const stats = mine && ((post.saveCount || 0) > 0 || (post.sendCount || 0) > 0);
  if (!counts.like && !counts.comment && !stats && !caption && !tags) return null;

  return (
    <div className="space-y-1 text-callout leading-6">
      {counts.like > 0 && (
        <p className="text-fg-muted">
          {shownLiker ? (
            <span className="text-fg">Liked by{" "}
              <button type="button" onClick={() => openUserProfile(shownLiker.id)} className="font-semibold text-fg hover:underline">
                @{shownLiker.username}
              </button>
              {counts.like > 1 && <> and <span className="font-semibold text-fg">{plural(counts.like - 1, "other")}</span></>}
            </span>
          ) : (
            <span className="font-semibold text-fg">{plural(counts.like, "like")}</span>
          )}
        </p>
      )}
      {caption}
      {tags}
      {!compact && comment && (
        <p className="line-clamp-2 text-fg">
          <button type="button" onClick={() => comment.authorId && openUserProfile(comment.authorId)} className="mr-1.5 font-semibold hover:underline">
            @{comment.authorName}
          </button>
          {comment.text || (comment.gif ? <span className="text-fg-muted">sent a GIF</span> : null)}
        </p>
      )}
      {counts.comment > (comment && !compact ? 1 : 0) && (
        <button type="button" onClick={onOpenComments} className="block min-h-7 text-fg-subtle hover:text-fg">
          {counts.comment === 1 ? "View 1 comment" : `View all ${counts.comment} comments`}
        </button>
      )}
      {stats && (
        <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
          <Eye size={13} aria-hidden="true" /> Only you see this:
          {" "}{plural(post.saveCount || 0, "save")} · {plural(post.sendCount || 0, "send")}
        </p>
      )}
    </div>
  );
}

export function QuickComment({ post, onAdded }) {
  const { profile } = useShell();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `qc-${post.id}`;

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, LIMITS.comment, "Comment");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "comment", allowQuoted: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try {
      const c = await addComment(post, v.text, { sensitive: mod.sensitive });
      markPosted("comment", v.text);
      setText("");
      onAdded(c);
      if (mod.sensitive) toast({ tone: "info", title: "Posted", body: mod.quoted ? "Others will see a warning and tap to read it, as it quotes offensive language." : "It may be folded away for others, as it could come across as mocking a group." });
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? `@${post.authorName} isn't taking comments from you on this post.`
        : "Couldn't post your comment. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mt-2">
      <div className="flex items-center gap-2">
        <Avatar profile={profile} size={24} />
        <label htmlFor={id} className="sr-only">Add a comment</label>
        <input id={id} value={text} maxLength={LIMITS.comment} autoComplete="off"
          onChange={(e) => { setText(e.target.value); if (error) setError(""); }}
          placeholder="Add a comment…" aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-err` : undefined}
          className="min-h-9 min-w-0 flex-1 rounded-full bg-transparent px-1 text-callout text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text/60" />
        {text.trim() && (
          <button type="submit" disabled={busy}
            className="press min-h-9 rounded-full px-3 text-callout font-semibold text-accent-text hover:bg-surface-2 disabled:opacity-50">
            {busy ? "Posting…" : "Post"}
          </button>
        )}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-caption text-danger-text">{error}</p>}
    </form>
  );
}
