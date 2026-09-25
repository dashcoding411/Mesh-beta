import { useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Ellipsis, Lock, Play, Clapperboard, WandSparkles,
} from "lucide-react";
import {
  toggleLike, toggleSave, toggleRepost, recordSignal, openUserProfile, openWatch, me,
} from "../lib/db";
import { navigate } from "../lib/router";
import { shortTime, fullTime, isoTime, formatDuration } from "../lib/format";
import { mediaAlt } from "../lib/a11y";
import Avatar from "./ui/Avatar";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import InlineVideo from "./ui/InlineVideo";
import Badge from "./ui/Badge";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet, PostMenu } from "./PostActions";

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
  const pending = useRef({});
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

  return (
    <article aria-labelledby={titleId}
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

          <Body post={post} highlight={highlight} onDoubleTap={likeFromDoubleTap} burst={burst} />
          {post.aiGenerated && (
            <Badge icon={WandSparkles} className="mt-2" >Made with AI</Badge>
          )}

          <div className="-ml-2.5 mt-1 flex items-center" role="group" aria-label="Post actions">
            <IconButton icon={Heart} label={liked ? "Unlike" : "Like"} pressed={liked} count={counts.like} countNoun="like"
              activeClass="text-fuchsia-400" size={19} onClick={like}
              className={burst ? "anim-heart" : ""} />
            <IconButton icon={MessageCircle} label="Comments" count={counts.comment} countNoun="comment" size={19}
              onClick={() => setSheet("comments")} />
            <IconButton icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} pressed={reposted}
              count={counts.repost} countNoun="repost" activeClass="text-success-text" size={19}
              aria-disabled={repostDisabled || undefined}
              className={repostDisabled ? "opacity-45" : ""} onClick={repost} />
            <IconButton icon={Send} label="Share" size={19} onClick={() => setSheet("share")} />
            <IconButton icon={Bookmark} label={saved ? "Remove from saved" : "Save"} pressed={saved}
              activeClass="text-accent-text" size={19} className="ml-auto" onClick={save} />
          </div>
        </div>
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)}
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
    return <RichText text={post.text} highlight={highlight}
      className={`mt-1 text-fg ${short ? "text-title-3 font-normal leading-snug" : "text-body"}`} />;
  }

  if (post.kind === "post") {
    return (
      <>
        {post.text && <RichText text={post.text} highlight={highlight} className="mt-1 text-body text-fg" />}
        {post.mediaUrl && (
          <div className="relative mt-3 overflow-hidden rounded-card border border-line bg-surface"
            onDoubleClick={onDoubleTap}>
            <img src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" decoding="async"
              className="max-h-[70vh] w-full object-cover" />
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
