import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle, SendHorizontal, Trash2, Lock, Sticker, X, Flag, EyeOff, Heart, Reply, ImagePlus, Plus,
} from "lucide-react";
import ReportDialog from "./ReportDialog";
import { gifsEnabled } from "../lib/gifs";
import GifPicker, { GifView } from "./GifPicker";
import {
  fetchComments, addComment, deleteComment, toggleCommentLike, fetchMyCommentLikes, uploadPhotos, openUserProfile,
  fetchProfile, me, StorageUnavailableError,
} from "../lib/db";
import { useShell } from "./shell/ShellContext";
import { useLiveCard } from "../lib/profileCache";
import { BadgeMark } from "./ui/Badges";
import { buildCommentTree, countReplies, likesHidden } from "../lib/commentTree";
import { checkFile, warmUp, UNSAFE_PHOTO } from "../lib/imageCheck";
import { authPath, navigate } from "../lib/router";
import { LIMITS, validateText, validateMediaFile } from "../lib/validate";
import { blockedByReader, checkContent, hitsHiddenWords, markPosted, postAbout, wonAppeal } from "../lib/moderation";
import { readNewComment, readThread } from "../lib/threadContext";
import { shortTime, fullTime, isoTime, compact, plural } from "../lib/format";
import Dialog from "./ui/Dialog";
import LiveAvatar from "./ui/LiveAvatar";
import IconButton from "./ui/IconButton";
import MediaImg from "./ui/MediaImg";
import RichText from "./ui/RichText";
import Segmented from "./ui/Segmented";
import MentionTextarea from "./ui/MentionTextarea";
import { Skeleton, EmptyState, ErrorState, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

// Replies nest under the comment they answer, Reddit-style, up to MAX_DEPTH
// levels; deeper replies continue at that level. A thread line collapses
// its replies.
const MAX_DEPTH = 4;

export default function Comments({ post, onClose, onCountChange, onAdded }) {
  const toast = useToast();
  const { guest, needsAccount, workAccount } = useShell();
  const [reporting, setReporting] = useState(null);
  const [closedReason, setClosedReason] = useState("");
  const [comments, setComments] = useState(null);
  // People in this thread, offered first when typing @.
  const mentionable = [
    { id: post.authorId, username: post.authorName, name: post.authorDisplayName, photoURL: post.authorPhoto },
    ...(comments || []).map((c) => ({ id: c.authorId, username: c.authorName, name: c.authorDisplayName, photoURL: c.authorPhoto })),
  ];
  const [liked, setLiked] = useState(new Set());
  const [sort, setSort] = useState("best");
  const [collapsed, setCollapsed] = useState(new Set());
  const [revealed, setRevealed] = useState(new Set());
  const [loadError, setLoadError] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [gif, setGif] = useState(null);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [picking, setPicking] = useState(false);
  const fileInput = useRef(null);
  const inputRef = useRef(null);
  const isAuthor = post.authorId === me();

  const load = () => {
    setLoadError(false);
    setComments(null);
    fetchComments(post.id)
      .then((list) => {
        setComments(list);
        fetchMyCommentLikes(post.id, list).then(setLiked).catch(() => {});
      })
      .catch(() => setLoadError(true));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [post.id]);

  useEffect(() => {
    if (post.authorId === me()) return;
    fetchProfile(post.authorId).then((author) => {
      // "following" policy is resolved by the rules at write time.
      if ((author?.commentPolicy || "everyone") === "off") setClosedReason(`@${post.authorName} has turned comments off.`);
    }).catch(() => {});
  }, [post.authorId, post.authorName]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  // Every comment is read against the post and the thread around it.
  const about = postAbout(post);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verdicts = useMemo(() => readThread(post, comments || []), [comments, about]);
  const tree = useMemo(() => {
    if (!comments) return null;
    return buildCommentTree(comments, sort, (c) => ["block", "borderline"].includes(verdicts.get(c.id)?.level));
  }, [comments, sort, verdicts]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const v = validateMediaFile(file, "image");
    if (v.error) return setError(v.error);
    setGif(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
    // Checked on the device straight away; a photo that fails comes back out.
    checkFile(file).then((verdict) => {
      if (verdict === "ok") return;
      setPhoto((cur) => (cur?.file === file ? null : cur));
      setError(UNSAFE_PHOTO);
    }).catch(() => {});
  };

  const startReply = (c) => {
    if (needsAccount("reply to comments")) return;
    setReplyTo(c);
    inputRef.current?.focus();
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (needsAccount("reply to comments")) return;
    const v = validateText(text, LIMITS.comment, "Comment");
    if (v.error) return setError(v.error);
    if (!v.text && !gif && !photo) return;
    let flagged = null;
    if (v.text) {
      const mod = checkContent(v.text, { key: "comment", allowQuoted: true, about, thread: replyTo?.text || "", parent: replyTo?.text || "" });
      if (mod.error) return setError(mod.error);
      if (mod.sensitive) flagged = mod;
      const read = wonAppeal(v.text) ? null : readNewComment(post, comments || [], v.text, { parent: replyTo, authorId: me() });
      if (read?.category === "context") {
        if (read.level === "block") return setError(blockedByReader(v.text, "context"));
        flagged = { borderline: true, sensitive: true };
      }
    }
    setBusy(true);
    setError("");
    try {
      let image = null;
      if (photo) {
        const [up] = await uploadPhotos([photo.file]);
        image = { url: up.url, w: Math.round(up.width || 0), h: Math.round(up.height || 0) };
      }
      const c = await addComment(post, v.text, {
        gif: gif && { url: gif.url, width: gif.width, height: gif.height, title: gif.title },
        image, parent: replyTo, sensitive: !!flagged,
      });
      markPosted("comment", v.text);
      setComments((prev) => [...(prev || []), c]);
      if (replyTo) setCollapsed((s) => { const n = new Set(s); n.delete(replyTo.id); return n; });
      setText("");
      setGif(null);
      setPhoto(null);
      setReplyTo(null);
      onCountChange?.(1);
      onAdded?.(c);
      if (flagged) toast({ tone: "info", title: "Posted", body: flagged.quoted ? "Others will see a warning and tap to read it, as it quotes offensive language." : "It may be folded away for others, as it could come across as mocking a group." });
    } catch (err) {
      setError(err?.name === "UnsafeImageError" ? err.message
        : err instanceof StorageUnavailableError ? "Photos can't be uploaded right now."
        : err?.code === "permission-denied" ? `@${post.authorName} only takes comments from people they follow.`
        : "Couldn't post your comment. It's still here, so try again.");
    } finally {
      setBusy(false);
    }
  };

  // A comment with replies leaves a placeholder so the thread holds together.
  const remove = async (c) => {
    const prev = comments;
    setComments((list) => list.filter((x) => x.id !== c.id));
    onCountChange?.(-1);
    try {
      await deleteComment(post, c);
      toast({ title: "Comment deleted" });
    } catch {
      setComments(prev);
      onCountChange?.(1);
      toast({ tone: "error", title: "Couldn't delete that comment" });
    }
  };

  const like = async (c) => {
    if (needsAccount("like comments")) return;
    const was = liked.has(c.id);
    const bump = (d) => setComments((list) => list.map((x) => (x.id === c.id ? { ...x, likeCount: Math.max(0, (x.likeCount || 0) + d) } : x)));
    setLiked((s) => { const n = new Set(s); if (was) n.delete(c.id); else n.add(c.id); return n; });
    bump(was ? -1 : 1);
    try { await toggleCommentLike(post, c, was); }
    catch {
      setLiked((s) => { const n = new Set(s); if (was) n.add(c.id); else n.delete(c.id); return n; });
      bump(was ? 1 : -1);
      toast({ tone: "error", title: "Couldn't update your like" });
    }
  };

  const toggleThread = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const onKey = (e) => {
    // Enter submits on desktop; newline on touch.
    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      submit();
    }
  };

  const count = comments?.length ?? post.commentCount ?? 0;
  const ctx = {
    post, isAuthor, liked, collapsed, revealed, verdicts, onLike: like, onReply: startReply, onRemove: remove,
    onReport: (c) => (needsAccount("report comments") ? null : setReporting(c)),
    onToggle: toggleThread, onReveal: (id) => setRevealed((r) => new Set(r).add(id)),
  };

  return (
    <Dialog title={count ? `Comments (${count})` : "Comments"} onClose={onClose} size="lg" initialFocusRef={inputRef}
      bodyClassName="!px-0"
      footer={workAccount ? (
        <p className="text-center text-callout text-fg-muted">Work accounts don&apos;t comment.</p>
      ) : guest ? (
        <p className="text-center text-callout text-fg-muted">
          <button type="button" onClick={() => navigate(authPath("login"))}
            className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline">Log in</button> to join the conversation.
        </p>
      ) : post.locked || closedReason ? (
        <p className="flex items-center justify-center gap-2 text-callout text-fg-muted">
          <Lock size={16} aria-hidden="true" /> {post.locked ? "A moderator has paused comments on this post." : closedReason}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {replyTo && (
            <p className="flex items-center gap-2 text-caption text-fg-muted">
              <Reply size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Replying to <strong className="text-fg">@{replyTo.authorName}</strong></span>
              <IconButton icon={X} label="Cancel reply" size={14} onClick={() => setReplyTo(null)} />
            </p>
          )}
          {(gif || photo) && (
            <div className="relative w-28">
              {gif ? <GifView gif={gif} /> : <img src={photo.url} alt="" className="max-h-28 w-28 rounded-control object-cover" />}
              <IconButton icon={X} label={gif ? "Remove GIF" : "Remove photo"} tone="overlay" size={16} className="absolute -right-1 -top-1"
                onClick={() => { setGif(null); setPhoto(null); }} />
            </div>
          )}
          <div className="flex items-end gap-1">
            <IconButton icon={ImagePlus} label="Add a photo" className="-ml-2 shrink-0" onClick={() => { warmUp(); fileInput.current?.click(); }} />
            {gifsEnabled && <IconButton icon={Sticker} label="Add a GIF" className="shrink-0" onClick={() => setPicking(true)} />}
            <label htmlFor="comment-box" className="sr-only">{replyTo ? `Reply to @${replyTo.authorName}` : "Add a comment"}</label>
            <MentionTextarea id="comment-box" ref={inputRef} autoGrow rows={1} maxRows={5} value={text} suggest={mentionable} wrapperClassName="ml-1 min-w-0 flex-1"
              onChange={(e) => { setText(e.target.value); if (error) setError(""); }} onKeyDown={onKey}
              placeholder={replyTo ? `Reply to @${replyTo.authorName}…` : `Comment on @${post.authorName}'s post…`} maxLength={LIMITS.comment}
              aria-invalid={error ? "true" : undefined} aria-describedby={error ? "comment-error" : undefined}
              className="min-h-11" />
            <IconButton type="submit" icon={SendHorizontal} label={replyTo ? "Post reply" : "Post comment"} tone="primary"
              disabled={busy || (!text.trim() && !gif && !photo)} />
          </div>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickPhoto} aria-hidden="true" tabIndex={-1} />
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
      {tree?.length === 0 && (
        <EmptyState compact icon={MessageCircle} title="No comments yet"
          body={post.locked ? "Comments are paused on this post." : null} />
      )}
      {tree?.length > 0 && (
        <>
          <div className="px-5 pb-2">
            <Segmented label="Sort comments" value={sort} onChange={setSort} className="w-60"
              options={[{ id: "best", label: "Best" }, { id: "top", label: "Top" }, { id: "new", label: "New" }]} />
          </div>
          <ul className="space-y-4 px-4 pb-4">
            {tree.map((n) => <CommentNode key={n.id} node={n} depth={0} ctx={ctx} />)}
          </ul>
        </>
      )}
      {reporting && (
        <ReportDialog onClose={() => setReporting(null)}
          target={{ type: "comment", id: reporting.id, authorId: reporting.authorId, postId: post.id, text: reporting.text }} />
      )}
      {picking && <GifPicker onClose={() => setPicking(false)} onPick={(g) => { setGif(g); setPhoto(null); setPicking(false); }} />}
    </Dialog>
  );
}

// The author's verified tick and badge, from their current profile.
function AuthorMarks({ uid, username }) {
  const card = useLiveCard(uid, { username });
  if (!card.badges?.length) return null;
  return <span className="inline-flex items-center gap-1 self-center"><BadgeMark badges={card.badges} /></span>;
}

function CommentNode({ node, depth, ctx, replyingTo }) {
  const { hiddenAuthors, hiddenWords } = useShell();
  const mine = node.authorId === me();
  const isOpen = !ctx.collapsed.has(node.id);
  const nest = depth < MAX_DEPTH;
  const replies = node.children;
  const isLiked = ctx.liked.has(node.id);
  const hideCount = likesHidden(node);

  // Folded behind a tap: muted or blocked authors, hidden words, flagged wording.
  const verdict = node.deleted || mine || ctx.revealed.has(node.id) ? null : ctx.verdicts.get(node.id);
  const level = verdict?.level || "ok";
  const why = node.deleted || mine || ctx.revealed.has(node.id) ? ""
    : hiddenAuthors.has(node.authorId) ? "From an account you've muted or blocked"
    : hitsHiddenWords(node.text, hiddenWords) ? "Contains a word you've hidden"
    : verdict?.category === "context" ? "May be aimed at who this post is about"
    : verdict?.category === "preaching" ? "Preaching, and not about this post"
    : verdict?.category === "repeated" ? "The same thing over and over"
    : level === "quoted" ? "Quotes offensive language, to report or call it out"
    : level === "block" ? "May break the Community Guidelines"
    : level === "borderline" ? "Hidden because it may come across as mocking a group" : "";

  const body = node.deleted ? (
    <p className="py-1 text-callout italic text-fg-subtle">This comment was deleted.</p>
  ) : why ? (
    <p className="flex items-center gap-2 py-1 text-caption text-fg-subtle">
      <EyeOff size={14} aria-hidden="true" /><span className="flex-1">{why}</span>
      <button type="button" onClick={() => ctx.onReveal(node.id)} className="min-h-8 rounded-full px-2.5 font-semibold text-accent-text hover:bg-surface-2">Show</button>
    </p>
  ) : (
    <>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <button type="button" onClick={() => openUserProfile(node.authorId)} className="truncate text-callout font-semibold hover:underline">
          {node.authorDisplayName || `@${node.authorName}`}
        </button>
        <AuthorMarks uid={node.authorId} username={node.authorName} />
        {node.authorId === ctx.post.authorId && <span className="rounded bg-accent-soft px-1.5 text-label font-semibold text-accent-text">Author</span>}
        {node.fresh && node.authorId !== ctx.post.authorId && (
          <span title="Written when this account was under a week old" className="rounded bg-surface-2 px-1.5 text-label font-semibold text-fg-muted">New account</span>
        )}
        <time dateTime={isoTime(node.createdAt)} title={fullTime(node.createdAt)} className="text-caption text-fg-subtle">{shortTime(node.createdAt)}</time>
      </p>
      {replyingTo && <p className="text-caption text-fg-subtle">Replying to @{replyingTo}</p>}
      {node.text && <RichText text={node.text} plainLinks={!!node.fresh} className="mt-0.5 text-callout text-fg" />}
      {node.gif && <GifView gif={node.gif} className="mt-1.5 max-w-[220px]" />}
      {node.image && (
        <MediaImg src={node.image.url} alt="Photo in a comment" loading="lazy"
          className="mt-1.5 max-h-72 max-w-[260px] rounded-control object-cover" placeholderClass="mt-1.5 h-40 w-[200px] rounded-control" />
      )}
      <div className="-ml-2 mt-0.5 flex items-center" role="group" aria-label="Comment actions">
        <button type="button" onClick={() => ctx.onLike(node)} aria-pressed={isLiked}
          title={hideCount ? "Likes show once a comment is an hour old" : undefined}
          aria-label={hideCount ? `${isLiked ? "Unlike" : "Like"}. Likes show once a comment is an hour old` : `${isLiked ? "Unlike" : "Like"}, ${plural(node.likeCount || 0, "like")}`}
          className={`press inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-caption font-semibold ${isLiked ? "text-like" : "text-fg-muted hover:text-fg"}`}>
          <Heart size={15} fill={isLiked ? "currentColor" : "none"} aria-hidden="true" />
          {!hideCount && node.likeCount > 0 && <span className="tabular">{compact(node.likeCount)}</span>}
        </button>
        <button type="button" onClick={() => ctx.onReply(node)}
          className="press inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-caption font-semibold text-fg-muted hover:text-fg">
          <Reply size={15} aria-hidden="true" /> Reply
        </button>
        {(mine || ctx.isAuthor) && (
          <IconButton icon={Trash2} label="Delete comment" size={15} className="opacity-70 hover:opacity-100" onClick={() => ctx.onRemove(node)} />
        )}
        {!mine && (
          <IconButton icon={Flag} label={`Report @${node.authorName}'s comment`} size={15} className="opacity-60 hover:opacity-100" onClick={() => ctx.onReport(node)} />
        )}
      </div>
    </>
  );

  const self = (
    <li className="flex gap-2.5">
      <div className="flex shrink-0 flex-col items-center">
        {node.deleted ? (
          <span className="h-7 w-7 rounded-full bg-surface-2" aria-hidden="true" />
        ) : (
          <button type="button" onClick={() => openUserProfile(node.authorId)} aria-label={`@${node.authorName}'s profile`}>
            <LiveAvatar uid={node.authorId} profile={{ name: node.authorDisplayName, username: node.authorName, photoURL: node.authorPhoto }} size={depth ? 24 : 30} />
          </button>
        )}
        {/* The thread line: tap to fold this comment's replies. */}
        {nest && replies.length > 0 && isOpen && (
          <button type="button" onClick={() => ctx.onToggle(node.id)} aria-label={`Hide ${plural(countReplies(replies), "reply", "replies")}`}
            className="group mt-1 flex w-5 flex-1 justify-center">
            <span className="w-0.5 rounded-full bg-line-strong transition-colors group-hover:bg-accent-text" />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {body}
        {nest && replies.length > 0 && (isOpen ? (
          <ul className="mt-3 space-y-3">
            {replies.map((r) => <CommentNode key={r.id} node={r} depth={depth + 1} ctx={ctx} />)}
          </ul>
        ) : (
          <button type="button" onClick={() => ctx.onToggle(node.id)}
            className="press mt-1 inline-flex min-h-8 items-center gap-1 rounded-full px-1 text-caption font-semibold text-accent-text hover:underline">
            <Plus size={13} aria-hidden="true" /> {plural(countReplies(replies), "more reply", "more replies")}
          </button>
        ))}
      </div>
    </li>
  );

  if (nest || !replies.length) return self;
  // At the deepest level, replies continue alongside with who they answer.
  return (
    <>
      {self}
      {replies.map((r) => <CommentNode key={r.id} node={r} depth={depth} ctx={ctx} replyingTo={node.authorName} />)}
    </>
  );
}
