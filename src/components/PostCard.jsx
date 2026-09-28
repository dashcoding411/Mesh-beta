import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Ellipsis, Lock, Play, Clapperboard, WandSparkles, Link2, Eye, EyeOff,
} from "lucide-react";
import {
  toggleLike, toggleSave, toggleRepost, recordSignal, openUserProfile, openWatch, me,
  fetchLikers, fetchTopComment, addComment, isHeld,
} from "../lib/db";
import { navigate, postUrl } from "../lib/router";
import { shortTime, fullTime, isoTime, formatDuration, compact as compactNum, plural } from "../lib/format";
import { mediaAlt } from "../lib/a11y";
import { interestById } from "../lib/interests";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent, isBorderline, hitsHiddenWords, assessText, markPosted } from "../lib/moderation";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import InlineVideo from "./ui/InlineVideo";
import MediaImg from "./ui/MediaImg";
import Badge from "./ui/Badge";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet, PostMenu } from "./PostActions";
import { GifView } from "./GifPicker";
import { PollCard } from "./Poll";

/* One card for every format, so the For You mix reads as one feed rather
   than four products stitched together. Avatar column on the left, content
   on the right, the same shape whether it's a Strand, a Still or a Flick,
   with only the body changing. */
export default function PostCard({
  post, viewer, onViewerChange, onRemoved, canModerate = false, highlight, compact = false,
}) {
  const toast = useToast();
  const [counts, setCounts] = useState({
    like: post.likeCount || 0, comment: post.commentCount || 0,
    repost: post.repostCount || 0, save: post.saveCount || 0,
  });
  const [sheet, setSheet] = useState(null); // 'comments' | 'share' | 'menu'
  const [burst, setBurst] = useState(false);
  const [preview, setPreview] = useState(null); // the comment shown under the post
  const pending = useRef({});
  const cardRef = useRef(null);
  const seen = useInView(cardRef);
  const { blocked, hiddenWords } = useShell();
  const [revealed, setRevealed] = useState(false);
  const mineNow = post.authorId === me();
  // Offensive words let through on context sit behind a tap, so nobody meets
  // them unwarned. Your own posts are never covered for you.
  const cover = useMemo(() => {
    if (mineNow) return "";
    const level = assessText(`${post.title || ""}\n${post.text || ""}`).level;
    if (level === "quoted") return "This post quotes offensive language, to report or call it out.";
    if (level === "block") return "This post may break the Community Guidelines.";
    return "";
  }, [mineNow, post.title, post.text]);
  const titleId = `post-${post.id}-author`;

  const liked = viewer?.liked.has(post.id) || false;
  const saved = viewer?.saved.has(post.id) || false;
  const reposted = viewer?.reposted.has(post.id) || false;
  const mine = post.authorId === me();

  /* Optimistic: the UI flips first, the write follows, and a failure puts
     it back with a message, so a tap always feels instant, and never lies. */
  const optimistic = async (key, field, on, write, failMsg) => {
    if (pending.current[key]) return;
    pending.current[key] = true;
    onViewerChange?.(post.id, field, on);
    setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + (on ? 1 : -1)) }));
    try {
      await write();
      return true;
    } catch (err) {
      console.error(err);
      onViewerChange?.(post.id, field, !on);
      setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + (on ? -1 : 1)) }));
      toast({ tone: "error", title: failMsg, body: "Check your connection and try again." });
      return false;
    } finally {
      pending.current[key] = false;
    }
  };

  const like = () => optimistic("like", "liked", !liked, () => toggleLike(post, liked), "Couldn't update your like");

  const likeFromDoubleTap = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    if (!liked) like();
  };

  const save = async () => {
    const ok = await optimistic("save", "saved", !saved, () => toggleSave(post, saved), "Couldn't update Saved");
    if (ok && !saved) toast({ title: "Saved", action: { label: "View saved", onClick: () => navigate("/saved") } });
  };

  const repost = async () => {
    if (mine) return toast({ tone: "info", title: "You can't repost your own post", body: "Share it instead, or send it to someone." });
    if (post.visibility !== "public") {
      return toast({ tone: "info", title: "Only public posts can be reposted", body: "Reposting would show it to people the author didn't choose." });
    }
    const on = !reposted;
    const ok = await optimistic("repost", "reposted", on, () => toggleRepost(post, reposted), "Couldn't update your repost");
    if (ok && on) {
      toast({
        title: "Reposted to your followers",
        action: { label: "Undo", onClick: () => optimistic("repost", "reposted", false, () => toggleRepost(post, true), "Couldn't undo the repost") },
      });
    }
  };

  const repostDisabled = mine || post.visibility !== "public";
  // Members-only and pending posts shouldn't travel by link to strangers,
  // but members can still copy it for each other.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl(post));
      toast({ title: "Link copied", body: post.visibility === "public" ? undefined : "Only people who can already see this post can open it." });
    } catch {
      toast({ tone: "error", title: "Couldn't copy the link", body: postUrl(post) });
    }
  };

  return (
    <article aria-labelledby={titleId} ref={cardRef}
      className={`relative border-b border-line px-4 ${compact ? "py-3" : "py-4"} transition-colors`}>
      {post.repostedBy?.length > 0 && (
        <p className="mb-2 ml-[52px] flex items-center gap-1.5 text-caption font-medium text-fg-subtle">
          <Repeat2 size={14} aria-hidden="true" />
          <span className="truncate">
            {post.repostedBy[0].username ? `@${post.repostedBy[0].username}` : "Someone you follow"}
            {post.repostedBy.length > 1 && ` and ${post.repostedBy.length - 1} more`} reposted
          </span>
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => openUserProfile(post.authorId)} className="press h-fit shrink-0 rounded-full"
          aria-label={`${post.authorDisplayName || post.authorName}'s profile`}>
          <Avatar profile={{ name: post.authorDisplayName, username: post.authorName, photoURL: post.authorPhoto }} size={40} />
        </button>

        <div className="min-w-0 flex-1">
          <header className="flex min-h-6 items-center gap-1">
            <button type="button" onClick={() => openUserProfile(post.authorId)} id={titleId}
              className="flex min-w-0 items-baseline gap-1.5 text-left hover:underline decoration-fg-subtle underline-offset-2">
              <span className="truncate text-callout font-semibold text-fg">{post.authorDisplayName || post.authorName}</span>
              <span className="truncate text-caption text-fg-subtle">@{post.authorName}</span>
            </button>
            <span className="shrink-0 text-caption text-fg-subtle" aria-hidden="true">·</span>
            <time dateTime={isoTime(post.createdAt)} title={fullTime(post.createdAt)}
              className="shrink-0 text-caption text-fg-subtle tabular">
              {shortTime(post.createdAt)}
            </time>
            {post.visibility === "followers" && (
              <span className="shrink-0 text-fg-subtle" title="Followers only">
                <Lock size={13} aria-hidden="true" />
                <span className="sr-only">Followers only</span>
              </span>
            )}
            <IconButton icon={Ellipsis} label="More options" size={18} className="-my-2 -mr-2 ml-auto"
              onClick={() => setSheet("menu")} />
          </header>

          {mine && isHeld(post) && (
            <p className="mt-2 rounded-control bg-warning-text/10 px-3 py-2 text-caption text-warning-text">
              Several people reported this, so it's out of feeds while a moderator reviews it. If it follows the guidelines, it goes back up.
            </p>
          )}
          {cover && !revealed ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-3">
              <EyeOff size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-callout text-fg-muted">{cover}</p>
              <button type="button" onClick={() => setRevealed(true)}
                className="press min-h-9 rounded-full px-3 text-callout font-semibold text-accent-text hover:bg-surface-3">
                Show post
              </button>
            </div>
          ) : (
            <Body post={post} highlight={highlight} onDoubleTap={likeFromDoubleTap} burst={burst} />
          )}
          {(post.aiGenerated || post.topics?.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {post.aiGenerated && <Badge icon={WandSparkles}>Made with AI</Badge>}
              {post.topics?.map((t) => {
                const it = interestById(t);
                if (!it) return null;
                return (
                  <button key={t} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(it.label)}`)}
                    className="press inline-flex min-h-7 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-label font-semibold text-fg-muted ring-1 ring-line hover:bg-surface-3 hover:text-fg">
                    <it.icon size={12} aria-hidden="true" /> {it.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="-ml-2.5 mt-2 flex items-center gap-0.5" role="group" aria-label="Post actions">
            <Action icon={Heart} label={liked ? "Unlike" : "Like"} text="Like" pressed={liked} count={counts.like} noun="like"
              activeClass="text-fuchsia-400" onClick={like} className={burst ? "anim-heart" : ""} />
            <Action icon={MessageCircle} label="Comments" text="Comment" count={counts.comment} noun="comment"
              onClick={() => setSheet("comments")} />
            <Action icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} text="Repost" pressed={reposted}
              count={counts.repost} noun="repost" activeClass="text-success-text" noFill
              disabled={repostDisabled} onClick={repost} />
            <Action icon={Send} label="Share" text="Share" onClick={() => setSheet("share")} />
            <span className="flex-1" />
            <IconButton icon={Link2} label="Copy link" size={19} onClick={copyLink} />
            <Action icon={Bookmark} label={saved ? "Remove from saved" : "Save"} text={saved ? "Saved" : "Save"} pressed={saved}
              activeClass="text-accent-text" onClick={save} />
          </div>

          {!compact && (
            <SocialProof post={post} counts={counts} seen={seen} blocked={blocked} mine={mine} hiddenWords={hiddenWords}
              preview={preview} onOpenComments={() => setSheet("comments")} />
          )}
          {!compact && seen && !post.locked && (
            <QuickComment post={post} onAdded={(c) => {
              setPreview(c);
              setCounts((x) => ({ ...x, comment: x.comment + 1 }));
            }} />
          )}
        </div>
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)} onAdded={setPreview}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && <ShareSheet post={post} onClose={() => setSheet(null)} />}
      {sheet === "menu" && (
        <PostMenu post={post} mine={mine} canModerate={canModerate}
          onClose={() => setSheet(null)} onRemoved={() => onRemoved?.(post.id)} />
      )}
    </article>
  );
}

function Body({ post, highlight, onDoubleTap, burst }) {
  const short = post.kind === "text" && post.text.length <= 90 && !post.text.includes("\n");

  if (post.kind === "text") {
    return (
      <>
        {post.text && <RichText text={post.text} highlight={highlight}
          className={`mt-1 text-fg ${short && !post.poll ? "text-title-3 font-normal leading-snug" : "text-body"}`} />}
        {post.gif && <GifView gif={post.gif} className="mt-3" />}
        {post.poll && <PollCard post={post} />}
      </>
    );
  }

  if (post.kind === "post") {
    return (
      <>
        {post.text && <RichText text={post.text} highlight={highlight} className="mt-1 text-body text-fg" />}
        {post.mediaUrl && (
          <div className="relative mt-3 overflow-hidden rounded-card border border-line bg-surface"
            onDoubleClick={onDoubleTap}>
            <MediaImg src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy"
              className="max-h-[70vh] w-full object-cover" placeholderClass="aspect-[4/5] w-full" />
            {burst && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <Heart size={96} className="anim-pop text-white drop-shadow-lg" fill="currentColor" />
              </span>
            )}
          </div>
        )}
      </>
    );
  }

  if (post.kind === "short") {
    return (
      <>
        {post.text && <RichText text={post.text} highlight={highlight} className="mt-1 text-body text-fg" />}
        <div className="relative mt-3 w-full max-w-[300px]">
          <InlineVideo src={post.mediaUrl} label={`Flick by @${post.authorName}`}
            className="aspect-[9/16] border border-line"
            onOpen={() => navigate(`/flicks/${post.id}`)}
            onView={() => recordSignal(post, "view").catch(() => {})} />
          <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-label font-semibold text-white backdrop-blur">
            <Clapperboard size={12} aria-hidden="true" /> Flick
          </span>
        </div>
      </>
    );
  }

  // Long Flick: the trailer plays inline; the full video opens in the player.
  return (
    <>
      {post.title && <h3 className="mt-1 text-title-3 text-fg">{post.title}</h3>}
      {post.text && <RichText text={post.text} highlight={highlight} className="mt-1 line-clamp-3 text-callout text-fg-muted" />}
      <div className="relative mt-3">
        <InlineVideo src={post.mediaUrl} start={post.trailerStart || 0} length={30}
          label={`Trailer for ${post.title || "a video"}`} className="aspect-video border border-line"
          onOpen={() => openWatch(post.id)} />
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-label font-semibold text-white backdrop-blur">
          Trailer
        </span>
        {post.duration > 0 && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-label font-semibold text-white tabular">
            {formatDuration(post.duration)}
          </span>
        )}
      </div>
      <button type="button" onClick={() => openWatch(post.id)}
        className="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-control bg-surface-2 px-4 text-callout font-semibold text-fg ring-1 ring-line-strong hover:bg-surface-3">
        <Play size={16} fill="currentColor" aria-hidden="true" />
        Watch the full video{post.duration > 0 ? ` · ${formatDuration(post.duration)}` : ""}
      </button>
    </>
  );
}

/* Load the extras (who liked it, the first comment) only once the card is
   actually on screen, so a long feed doesn't cost a read per post up front. */
function useInView(ref) {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/* A post action with its count, and on wide screens its name too, so the
   row reads "Like 12  Comment 3" rather than a line of bare glyphs. */
function Action({ icon: Icon, label, text, count, noun, pressed, activeClass = "text-accent-text", noFill, disabled, onClick, className = "" }) {
  const name = count > 0 && noun ? `${label}, ${plural(count, noun)}` : label;
  return (
    <button type="button" onClick={onClick} aria-label={name} title={label}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined} aria-disabled={disabled || undefined}
      className={`press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-surface-2
        ${pressed ? activeClass : "text-fg-muted hover:text-fg"} ${disabled ? "opacity-45" : ""} ${className}`}>
      <Icon size={20} strokeWidth={2} aria-hidden="true" fill={pressed && !noFill ? "currentColor" : "none"} />
      {count > 0 && <span aria-hidden="true" className="tabular text-callout font-semibold">{compactNum(count)}</span>}
      {text && <span aria-hidden="true" className="hidden text-callout font-medium xl:inline">{text}</span>}
    </button>
  );
}

/* "Liked by @sam and 11 others", the first comment, and a way into the rest.
   Your own posts also show how many people saved or sent it, which only you see. */
function SocialProof({ post, counts, seen, blocked, mine, hiddenWords, preview, onOpenComments }) {
  const [likers, setLikers] = useState([]);
  const [top, setTop] = useState(null);
  const wantLikers = seen && counts.like > 0;
  const wantTop = seen && (post.commentCount || 0) > 0;

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

  const shownLiker = likers.find((l) => !blocked.has(l.id) && l.id !== me());
  // The preview is the one comment everyone scrolling past sees, so it's
  // held to a higher bar: nothing borderline, nothing you've hidden.
  const topOk = top && !blocked.has(top.authorId) && !isBorderline(top.text) && !hitsHiddenWords(top.text, hiddenWords);
  const comment = preview || (topOk ? top : null);
  const stats = mine && ((post.saveCount || 0) > 0 || (post.sendCount || 0) > 0);
  if (!counts.like && !counts.comment && !stats) return null;

  return (
    <div className="mt-1 space-y-1.5 text-callout">
      {counts.like > 0 && (
        <p className="text-fg-muted">
          {shownLiker ? (
            <>Liked by{" "}
              <button type="button" onClick={() => openUserProfile(shownLiker.id)} className="font-semibold text-fg hover:underline">
                @{shownLiker.username}
              </button>
              {counts.like > 1 && <> and <span className="font-semibold text-fg">{plural(counts.like - 1, "other")}</span></>}
            </>
          ) : (
            <span className="font-semibold text-fg">{plural(counts.like, "like")}</span>
          )}
        </p>
      )}
      {comment && (
        <p className="line-clamp-2 text-fg">
          <button type="button" onClick={() => comment.authorId && openUserProfile(comment.authorId)} className="mr-1.5 font-semibold hover:underline">
            @{comment.authorName}
          </button>
          {comment.text || (comment.gif ? <span className="text-fg-muted">sent a GIF</span> : null)}
        </p>
      )}
      {counts.comment > (comment ? 1 : 0) && (
        <button type="button" onClick={onOpenComments} className="min-h-8 text-fg-muted hover:text-fg hover:underline">
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

/* Reply without leaving the feed. The same checks as the full comment sheet,
   and what you typed stays if it fails. */
function QuickComment({ post, onAdded }) {
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
      const c = await addComment(post, v.text, null, mod.sensitive);
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
