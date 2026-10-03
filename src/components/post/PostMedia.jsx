import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, Play, Clapperboard, ChevronLeft, ChevronRight } from "lucide-react";
import { recordSignal, openWatch } from "../../lib/db";
import { navigate } from "../../lib/router";
import { formatDuration } from "../../lib/format";
import { mediaAlt } from "../../lib/a11y";
import RichText from "../ui/RichText";
import InlineVideo from "../ui/InlineVideo";
import MediaImg from "../ui/MediaImg";
import Lightbox from "../ui/Lightbox";
import { GifView } from "../GifPicker";
import { PollCard } from "../Poll";

// Short Strands become colour cards, like text posts on Instagram, so a feed
// of words doesn't read like a timeline. Each keeps white text above 7:1.
const CARD_COLORS = [
  "from-violet-700 to-fuchsia-800", "from-blue-700 to-indigo-800", "from-teal-700 to-cyan-900",
  "from-rose-700 to-pink-900", "from-orange-700 to-red-900", "from-slate-700 to-slate-900",
];
const cardColor = (id = "") => CARD_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CARD_COLORS.length];

export function PostBody({ post, highlight, onDoubleTap, burst, onSlide, engaged }) {
  const short = post.kind === "text" && post.text.length <= 140 && !post.text.includes("\n");

  if (post.kind === "text" && short && post.text && !post.poll && !post.gif) {
    return (
      <div className="px-4 pt-3" onDoubleClick={onDoubleTap}>
        <div className={`relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-card bg-gradient-to-br px-6 py-10 text-center ${cardColor(post.id)}`}>
          <RichText text={post.text} highlight={highlight}
            className="font-display text-title-1 font-extrabold leading-tight text-white [overflow-wrap:anywhere] [&_a]:text-white [&_a]:decoration-white/60" />
          {burst && <Heart size={88} className="anim-heart pointer-events-none absolute text-white drop-shadow-lg" fill="currentColor" aria-hidden="true" />}
        </div>
      </div>
    );
  }

  // Longer Strands sit on their own panel so they read as a post, not a line of a timeline.
  if (post.kind === "text") {
    return (
      <div className="px-4 pt-3">
        {post.text && (
          <div className="rounded-card bg-surface-2 px-4 py-4">
            <RichText text={post.text} highlight={highlight}
              className={`text-fg ${short && !post.poll ? "text-title-2 font-normal leading-snug" : "text-body"}`} />
          </div>
        )}
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
        <InlineVideo src={post.mediaUrl} poster={post.posterUrl} label={`Flick by @${post.authorName}`} rounded={false}
          className="aspect-[4/5] w-full bg-black"
          onOpen={() => navigate(`/flicks/${post.id}`)}
          onView={() => recordSignal(post, "view").catch(() => {})} />
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-label font-semibold text-white backdrop-blur">
          <Clapperboard size={12} aria-hidden="true" /> Flick
        </span>
      </div>
    );
  }

  // Long video: inline trailer, full video in the player.
  return (
    <>
      <div className="relative mt-3">
        <InlineVideo src={post.mediaUrl} poster={post.posterUrl} start={post.trailerStart || 0} length={30} rounded={false}
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

// Full-width photo, cropped to 4:5 at most. Single tap opens the lightbox
// (delayed to disambiguate from a double tap, which likes).
function StillBody({ post, onDoubleTap, burst }) {
  const [open, setOpen] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => clearTimeout(pending.current), []);
  const tap = (e) => {
    // Keyboard activation (detail 0) never starts a double tap.
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

// Second look: a carousel that was on screen but not interacted with opens
// on slide 2 the next time it's rendered in a later session (once). Stored
// locally for a week.
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
/** Start index for a carousel, consuming any pending second look. */
function takeSecondLook(id) {
  if (passedThisVisit.has(id)) return 0;
  const map = readPassed();
  if (!map[id]) return 0;
  delete map[id];
  writePassed(map);
  return 1;
}

// Scroll-snap carousel sized to the first slide. Slides load one ahead of
// the furthest reached.
function Carousel({ post, onDoubleTap, burst, onSlide, engaged }) {
  const slides = post.media;
  const n = slides.length;
  const [startAt] = useState(() => takeSecondLook(post.id));
  const [index, setIndex] = useState(startAt);
  const [reach, setReach] = useState(startAt + 1); // highest slide index to load
  const [showCount, setShowCount] = useState(true);
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const pending = useRef(null);
  const hideTimer = useRef(null);
  const first = slides[0];
  const ratio = first.w > 0 && first.h > 0 ? Math.min(1.25, Math.max(1 / 1.91, first.h / first.w)) : 1.25;

  // Jump to the start slide before paint.
  useLayoutEffect(() => {
    if (startAt && ref.current) ref.current.scrollLeft = startAt * ref.current.clientWidth;
  }, [startAt]);

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

  // Record a pass when it left view after >800ms without interaction.
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

// At most five dots; edge dots shrink when more slides lie beyond them.
export function Dots({ count, index }) {
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
