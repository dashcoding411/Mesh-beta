import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Ellipsis, Lock, Play, Clapperboard, WandSparkles, Eye, EyeOff, MapPin, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  toggleLike, toggleSave, toggleRepost, recordSignal, openUserProfile, openWatch, me,
  fetchLikers, fetchTopComment, addComment, isHeld,
} from "../lib/db";
import { navigate } from "../lib/router";
import { shortTime, fullTime, isoTime, formatDuration, compact as compactNum, plural } from "../lib/format";
import { mediaAlt } from "../lib/a11y";
import { interestById } from "../lib/interests";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent, isBorderline, hitsHiddenWords, assessText, markPosted } from "../lib/moderation";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import LiveAvatar from "./ui/LiveAvatar";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import InlineVideo from "./ui/InlineVideo";
import MediaImg from "./ui/MediaImg";
import Lightbox from "./ui/Lightbox";
import Badge from "./ui/Badge";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet, PostMenu } from "./PostActions";
import EditPostDialog from "./EditPost";
import { GifView } from "./GifPicker";
import { PollCard } from "./Poll";

/* One card for every format, so the For You mix reads as one feed rather
   than four products stitched together, laid out like a photo feed: who
   posted it across the top, the photo or video edge to edge and large, the
   actions under it, then likes, the caption and comments. */
export default function PostCard({
  post: original, viewer, onViewerChange, onRemoved, onChanged, canModerate = false, highlight, compact = false,
}) {
  const toast = useToast();
  // Your own edits show at once, before any list holding the post catches up.
  const [edits, setEdits] = useState(null);
  const post = useMemo(() => (edits ? { ...original, ...edits } : original), [original, edits]);
  const [counts, setCounts] = useState({
    like: post.likeCount || 0, comment: post.commentCount || 0,
    repost: post.repostCount || 0, save: post.saveCount || 0,
  });
  const [sheet, setSheet] = useState(null); // 'comments' | 'share' | 'menu'
  const [burst, setBurst] = useState(false);
  // A carousel's photo on screen, for the dots under it.
  const [slide, setSlide] = useState(0);
  // Anything you do with the post (a tap, a swipe) means it wasn't passed by.
  const engaged = useRef(false);
  const [preview, setPreview] = useState(null); // the comment shown under the post
  const pending = useRef({});
  const cardRef = useRef(null);
  const seen = useInView(cardRef);
  const { hiddenAuthors, hiddenWords } = useShell();
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
    setTimeout(() => setBurst(false), 900);
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
  // Photos and videos read like a photo feed: the picture first, then what
  // people did with it, then the words. A Strand's words are the post, so
  // they come first.
  const media = post.kind !== "text";
  const author = post.authorName;

  return (
    <article aria-labelledby={titleId} ref={cardRef} tabIndex={-1} onClickCapture={() => { engaged.current = true; }}
      className={`relative border-b border-line ${compact ? "pb-2 pt-3" : "pb-3 pt-3.5"} transition-colors [container-type:inline-size]`}>
      {post.repostedBy?.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 px-4 text-caption font-medium text-fg-subtle">
          <Repeat2 size={14} aria-hidden="true" />
          <span className="truncate">
            {post.repostedBy[0].username ? `@${post.repostedBy[0].username}` : "Someone you follow"}
            {post.repostedBy.length > 1 && ` and ${post.repostedBy.length - 1} more`} reposted
          </span>
        </p>
      )}

      <header className="flex items-center gap-3 px-4">
        <button type="button" onClick={() => openUserProfile(post.authorId)} className="press shrink-0 rounded-full"
          aria-label={`${post.authorDisplayName || author}'s profile`}>
          <LiveAvatar uid={post.authorId} profile={{ name: post.authorDisplayName, username: author, photoURL: post.authorPhoto }} size={38} />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={() => openUserProfile(post.authorId)} id={titleId}
              className="truncate text-left text-callout font-semibold text-fg hover:opacity-70">
              {author}
            </button>
            <span className="shrink-0 text-caption text-fg-subtle" aria-hidden="true">·</span>
            <time dateTime={isoTime(post.createdAt)} title={fullTime(post.createdAt)}
              className="shrink-0 text-caption text-fg-subtle tabular">
              {shortTime(post.createdAt)}
            </time>
            {post.editedAt && (
              <span className="shrink-0 text-caption text-fg-subtle" title={`Edited ${fullTime(post.editedAt)}`}>· Edited</span>
            )}
            {post.visibility === "followers" && (
              <span className="shrink-0 text-fg-subtle" title="Followers only">
                <Lock size={13} aria-hidden="true" />
                <span className="sr-only">Followers only</span>
              </span>
            )}
          </div>
          {post.location ? (
            <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(post.location)}`)}
              className="flex max-w-full items-center gap-1 truncate text-caption text-fg-muted hover:text-fg">
              <MapPin size={11} className="shrink-0" aria-hidden="true" /><span className="truncate">{post.location}</span>
            </button>
          ) : post.authorDisplayName && post.authorDisplayName !== author && (
            <p className="truncate text-caption text-fg-subtle">{post.authorDisplayName}</p>
          )}
        </div>
        <IconButton icon={Ellipsis} label="More options" size={20} className="-mr-2 shrink-0" onClick={() => setSheet("menu")} />
      </header>

      {mine && isHeld(post) && (
        <p className="mx-4 mt-2 rounded-control bg-warning-text/10 px-3 py-2 text-caption text-warning-text">
          Several people reported this, so it's out of feeds while a moderator reviews it. If it follows the guidelines, it goes back up.
        </p>
      )}
      {cover && !revealed ? (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-3">
          <EyeOff size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-callout text-fg-muted">{cover}</p>
          <button type="button" onClick={() => setRevealed(true)}
            className="press min-h-9 rounded-full px-3 text-callout font-semibold text-accent-text hover:bg-surface-3">
            Show post
          </button>
        </div>
      ) : (
        <Body post={post} highlight={highlight} onDoubleTap={likeFromDoubleTap} burst={burst} onSlide={setSlide} engaged={engaged} />
      )}

      <div className="relative mt-1.5 flex items-center px-1.5" role="group" aria-label="Post actions">
        {post.media?.length > 1 && <Dots count={post.media.length} index={slide} />}
        <Action icon={Heart} label={liked ? "Unlike" : "Like"} pressed={liked} count={counts.like} noun="like"
          activeClass="text-like" onClick={like} className={burst ? "anim-heart" : ""} />
        <Action icon={MessageCircle} label="Comments" count={counts.comment} noun="comment"
          onClick={() => setSheet("comments")} />
        <Action icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} pressed={reposted}
          count={counts.repost} noun="repost" activeClass="text-success-text" noFill
          disabled={repostDisabled} onClick={repost} />
        <Action icon={Send} label="Share" onClick={() => setSheet("share")} />
        <span className="flex-1" />
        <Action icon={Bookmark} label={saved ? "Remove from saved" : "Save"} pressed={saved}
          activeClass="text-fg" onClick={save} />
      </div>

      <div className="px-4">
        <SocialProof post={post} counts={counts} seen={seen} hiddenAuthors={hiddenAuthors} mine={mine} hiddenWords={hiddenWords}
          preview={preview} onOpenComments={() => setSheet("comments")} compact={compact}
          caption={media && !(cover && !revealed) && (post.title || post.text) ? <Caption post={post} highlight={highlight} /> : null}
          tags={(post.aiGenerated || post.topics?.length > 0) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {post.aiGenerated && <Badge icon={WandSparkles}>Made with AI</Badge>}
              {post.topics?.map((t) => {
                const it = interestById(t);
                if (!it) return null;
                return (
                  <button key={t} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(it.label)}`)}
                    className="press inline-flex min-h-7 items-center gap-1 rounded-full px-1 text-label font-semibold text-accent-text hover:underline">
                    #{it.label.toLowerCase().replace(/[^a-z0-9]+/g, "")}
                  </button>
                );
              })}
            </div>
          ) : null} />
        {!compact && seen && !post.locked && (
          <QuickComment post={post} onAdded={(c) => {
            setPreview(c);
            setCounts((x) => ({ ...x, comment: x.comment + 1 }));
          }} />
        )}
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)} onAdded={setPreview}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && <ShareSheet post={post} onClose={() => setSheet(null)} />}
      {sheet === "menu" && (
        <PostMenu post={post} mine={mine} canModerate={canModerate} onEdit={() => setSheet("edit")}
          onClose={() => setSheet(null)} onRemoved={(why) => onRemoved?.(post.id, why)} />
      )}
      {sheet === "edit" && (
        <EditPostDialog post={post} onClose={() => setSheet(null)}
          onSaved={(changes) => {
            setEdits((prev) => ({ ...prev, ...changes }));
            onChanged?.(post.id, changes);
            setRevealed(false);
            setSheet(null);
          }} />
      )}
    </article>
  );
}

/* What the post shows: a Strand's words (large when short), or the photo or
   video, edge to edge and as big as the screen allows. */
function Body({ post, highlight, onDoubleTap, burst, onSlide, engaged }) {
  const short = post.kind === "text" && post.text.length <= 140 && !post.text.includes("\n");

  if (post.kind === "text") {
    return (
      <div className="px-4 pt-2">
        {post.text && <RichText text={post.text} highlight={highlight}
          className={`text-fg ${short && !post.poll ? "text-title-2 font-normal leading-snug" : "text-body"}`} />}
        {post.gif && <GifView gif={post.gif} className="mt-3" />}
        {post.poll && <PollCard post={post} />}
      </div>
    );
  }

  if (post.kind === "post") {
    return post.media?.length > 1
      ? <Carousel post={post} onDoubleTap={onDoubleTap} burst={burst} onSlide={onSlide} engaged={engaged} />
      : <StillBody post={post} onDoubleTap={onDoubleTap} burst={burst} />;
  }

  if (post.kind === "short") {
    return (
      <div className="relative mt-3">
        <InlineVideo src={post.mediaUrl} label={`Flick by @${post.authorName}`} rounded={false}
          className="aspect-[4/5] w-full bg-black"
          onOpen={() => navigate(`/flicks/${post.id}`)}
          onView={() => recordSignal(post, "view").catch(() => {})} />
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-label font-semibold text-white backdrop-blur">
          <Clapperboard size={12} aria-hidden="true" /> Flick
        </span>
      </div>
    );
  }

  // Long Flick: the trailer plays inline; the full video opens in the player.
  return (
    <>
      <div className="relative mt-3">
        <InlineVideo src={post.mediaUrl} start={post.trailerStart || 0} length={30} rounded={false}
          label={`Trailer for ${post.title || "a video"}`} className="aspect-video w-full bg-black"
          onOpen={() => openWatch(post.id)} />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-label font-semibold text-white backdrop-blur">
          Trailer
        </span>
        {post.duration > 0 && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/70 px-1.5 py-0.5 text-label font-semibold text-white tabular">
            {formatDuration(post.duration)}
          </span>
        )}
      </div>
      <div className="px-4">
        <button type="button" onClick={() => openWatch(post.id)}
          className="press mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-surface-2 px-4 text-callout font-semibold text-fg ring-1 ring-line-strong hover:bg-surface-3">
          <Play size={16} fill="currentColor" aria-hidden="true" />
          Watch the full video{post.duration > 0 ? ` · ${formatDuration(post.duration)}` : ""}
        </button>
      </div>
    </>
  );
}

/* A Still: the photo across the whole width, at its own shape between
   square-ish landscape and 4:5 portrait (taller ones are cropped to 4:5, as
   a feed can't be all one photo). One tap opens it full screen, two like it;
   the single tap waits a moment to be sure it isn't the first of two. */
function StillBody({ post, onDoubleTap, burst }) {
  const [open, setOpen] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => clearTimeout(pending.current), []);
  const tap = (e) => {
    // A keyboard press is never half of a double tap.
    if (e.detail === 0) return setOpen(true);
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
      return onDoubleTap();
    }
    pending.current = setTimeout(() => { pending.current = null; setOpen(true); }, 260);
  };
  if (!post.mediaUrl) return null;
  return (
    <>
      <button type="button" onClick={tap} aria-label={`Open photo. ${mediaAlt(post)}`}
        className="relative mt-3 block w-full cursor-zoom-in overflow-hidden bg-surface-2">
        <MediaImg src={post.mediaUrl} alt="" loading="lazy"
          className="block max-h-[125cqw] min-h-[52cqw] w-full object-cover" placeholderClass="aspect-[4/5] w-full" />
        {burst && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Heart size={110} className="anim-like-burst text-white drop-shadow-lg" fill="currentColor" />
          </span>
        )}
      </button>
      {open && <Lightbox src={post.mediaUrl} alt={post.alt} caption={post.text} onClose={() => setOpen(false)} />}
    </>
  );
}

/* A second look. A carousel you had on screen but passed without a tap or a
   swipe opens on its second photo the next time it comes round (a later
   visit, once), so its next photo gets a chance. Remembered on this device
   only, for a week. */
const SECOND_LOOK = "mesh:second-look";
const passedThisVisit = new Set();
function readPassed() {
  try { return JSON.parse(localStorage.getItem(SECOND_LOOK) || "{}"); } catch { return {}; }
}
function writePassed(map) {
  const week = Date.now() - 7 * 86400000;
  const kept = Object.entries(map).filter(([, at]) => at > week).sort((a, b) => b[1] - a[1]).slice(0, 100);
  try { localStorage.setItem(SECOND_LOOK, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage blocked */ }
}
function rememberPassed(id) {
  passedThisVisit.add(id);
  writePassed({ ...readPassed(), [id]: Date.now() });
}
/** Where a carousel starts: its second photo if it's owed a second look. */
function takeSecondLook(id) {
  if (passedThisVisit.has(id)) return 0;
  const map = readPassed();
  if (!map[id]) return 0;
  delete map[id];
  writePassed(map);
  return 1;
}

/* Several photos, swiped through one at a time (scroll snap, so it's the
   browser's own touch scrolling), at the first photo's shape. Photos load
   as they come near. Arrows on wide screens; dots under it in the actions. */
function Carousel({ post, onDoubleTap, burst, onSlide, engaged }) {
  const slides = post.media;
  const n = slides.length;
  const [startAt] = useState(() => takeSecondLook(post.id));
  const [index, setIndex] = useState(startAt);
  const [reach, setReach] = useState(startAt + 1); // photos up to here have been loaded
  const [showCount, setShowCount] = useState(true);
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const pending = useRef(null);
  const hideTimer = useRef(null);
  const first = slides[0];
  const ratio = first.w > 0 && first.h > 0 ? Math.min(1.25, Math.max(1 / 1.91, first.h / first.w)) : 1.25;

  // Opening on the second photo: go there before it's painted.
  useLayoutEffect(() => {
    if (startAt && ref.current) ref.current.scrollLeft = startAt * ref.current.clientWidth;
  }, [startAt]);

  // Which photo is showing: the one mostly in view.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = Number(e.target.dataset.i);
        setIndex(i);
        onSlide?.(i);
        setReach((r) => Math.max(r, i + 1));
        if (i !== startAt) engaged.current = true;
        setShowCount(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowCount(false), 2500);
      }
    }, { root, threshold: 0.6 });
    root.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => { io.disconnect(); clearTimeout(hideTimer.current); };
  }, [n, onSlide, engaged, startAt]);

  // Passed by: on screen for a moment, then gone, with nothing done to it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let since = 0;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) since = Date.now();
      else if (since && Date.now() - since > 800 && !engaged.current) rememberPassed(post.id);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [post.id, engaged]);

  useEffect(() => () => clearTimeout(pending.current), []);
  const go = (i) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * el.clientWidth, behavior: "smooth" });
  };
  const tap = (i) => (e) => {
    if (e.detail === 0) return setOpen(i);
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
      return onDoubleTap();
    }
    pending.current = setTimeout(() => { pending.current = null; setOpen(i); }, 260);
  };

  return (
    <div className="group relative mt-3" role="group" aria-roledescription="carousel" aria-label={`${n} photos`}>
      <div ref={ref} className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-surface-2 no-scrollbar"
        style={{ aspectRatio: `1 / ${ratio}` }}>
        {slides.map((m, i) => (
          <div key={i} data-i={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}
            className="relative h-full w-full shrink-0 snap-start [scroll-snap-stop:always]">
            <button type="button" onClick={tap(i)} aria-label={`Open photo ${i + 1} of ${n}. ${(i === 0 ? post.alt : m.alt) || mediaAlt(post)}`}
              className="block h-full w-full cursor-zoom-in">
              {i <= reach
                ? <MediaImg src={m.url} alt="" className="h-full w-full object-cover" placeholderClass="h-full w-full" draggable={false} />
                : <span className="skeleton block h-full w-full" aria-hidden="true" />}
            </button>
          </div>
        ))}
      </div>
      <span aria-live="polite"
        className={`pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-0.5 text-label font-semibold text-white tabular transition-opacity duration-300 ${showCount ? "opacity-100" : "opacity-0"}`}>
        {index + 1}/{n}
      </span>
      {index > 0 && (
        <button type="button" onClick={() => go(index - 1)} aria-label="Previous photo"
          className="press absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:flex">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {index < n - 1 && (
        <button type="button" onClick={() => go(index + 1)} aria-label="Next photo"
          className="press absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:flex">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {burst && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Heart size={110} className="anim-like-burst text-white drop-shadow-lg" fill="currentColor" />
        </span>
      )}
      {open !== null && (
        <Lightbox src={slides[open].url} alt={(open === 0 ? post.alt : slides[open].alt) || post.alt} caption={post.text} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/* Where you are in a carousel: up to five dots, the window moving with you,
   and the end dots smaller when there are more beyond them. */
function Dots({ count, index }) {
  const max = 5;
  const start = Math.min(Math.max(0, index - 2), Math.max(0, count - max));
  const shown = Array.from({ length: Math.min(count, max) }, (_, k) => start + k);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
      {shown.map((i, k) => {
        const edge = (k === 0 && start > 0) || (k === shown.length - 1 && start + max < count);
        return (
          <span key={i} className={`rounded-full transition-all duration-200 ${i === index ? "bg-accent" : "bg-fg-subtle/60"} ${edge ? "h-1 w-1" : "h-1.5 w-1.5"}`} />
        );
      })}
    </div>
  );
}

/* The words under a photo or video: the author's name in bold, then the
   caption, folded after a couple of lines with "more", like a photo feed. */
function Caption({ post, highlight }) {
  const [open, setOpen] = useState(false);
  const text = post.text || "";
  const long = text.length > 125 || text.split("\n").length > 2;
  const shown = open || !long ? text : `${text.slice(0, 110).split("\n").slice(0, 2).join("\n").trimEnd()}…`;
  return (
    <div className="text-callout text-fg">
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

/* A post action: a bare icon, full strength like a photo feed's, with its
   count beside it when there is one. */
function Action({ icon: Icon, label, count, noun, pressed, activeClass = "text-accent-text", noFill, disabled, onClick, className = "" }) {
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

/* "Liked by @sam and 11 others", the first comment, and a way into the rest.
   Your own posts also show how many people saved or sent it, which only you see. */
function SocialProof({ post, counts, seen, hiddenAuthors, mine, hiddenWords, preview, onOpenComments, caption, tags, compact }) {
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
  // The preview is the one comment everyone scrolling past sees, so it's
  // held to a higher bar: nothing borderline, nothing you've hidden.
  const topOk = top && !hiddenAuthors.has(top.authorId) && !isBorderline(top.text) && !hitsHiddenWords(top.text, hiddenWords);
  const comment = preview || (topOk ? top : null);
  const stats = mine && ((post.saveCount || 0) > 0 || (post.sendCount || 0) > 0);
  if (!counts.like && !counts.comment && !stats && !caption && !tags) return null;

  return (
    <div className="space-y-1 text-callout">
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
