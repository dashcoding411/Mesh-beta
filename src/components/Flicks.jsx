import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Play, Pause, Volume2, VolumeX, Plus, Check, Clapperboard, WandSparkles,
  ArrowLeft, Ellipsis, Hourglass, CheckCheck,
} from "lucide-react";
import {
  fetchPostsByKind, fetchPost, fetchAffinity, fetchHiddenPostIds, toggleLike, toggleSave, toggleRepost, toggleFollow,
  recordSignal, openUserProfile, me,
} from "../lib/db";
import { rankFeed } from "../lib/algorithm";
import { usePostStates } from "../lib/usePostStates";
import { goBack, navigate } from "../lib/router";
import { shortTime, compact, plural } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { EmptyState, ErrorState, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet, PostMenu } from "./PostActions";

// Unmute persists for the session.
let soundOn = false;

// Every CHECKPOINT Flicks a card says how long you've been watching.
const CHECKPOINT = 10;

// Short Flicks, one at a time, starting from the one picked on Flicks home.
// Long Flicks live on Flicks home and the full player. The feed ends.
export default function Flicks({ startId }) {
  const { following, hiddenAuthors, interests, hiddenWords, hideAi } = useShell();
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState(false);
  const [viewer, setViewer] = usePostStates(videos);
  const [muted, setMuted] = useState(!soundOn);
  const [startedAt] = useState(() => Date.now());
  const scroller = useRef(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [all, affinity, hidden] = await Promise.all([
        fetchPostsByKind("short"),
        fetchAffinity().catch(() => new Map()),
        fetchHiddenPostIds().catch(() => new Set()),
      ]);
      const list = all.filter((p) => !hidden.has(p.id) && !hiddenAuthors.has(p.authorId));
      let ordered = rankFeed(list, { followingSet: following, affinity, myUid: me(), interests, hiddenWords, hideAi });
      if (startId) {
        const start = ordered.find((p) => p.id === startId) || (await fetchPost(startId).catch(() => null));
        if (start?.kind === "short") ordered = [start, ...ordered.filter((p) => p.id !== startId)];
      }
      setVideos(ordered);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    // startId only matters on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, hiddenAuthors, interests, hiddenWords, hideAi]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const toggleSound = () => {
    soundOn = !soundOn;
    setMuted(!soundOn);
  };

  // Up/Down and J/K navigation.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select, [role=dialog]")) return;
      const el = scroller.current;
      if (!el) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); el.scrollBy({ top: el.clientHeight, behavior: "smooth" }); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); el.scrollBy({ top: -el.clientHeight, behavior: "smooth" }); }
      if (e.key === "m") toggleSound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const next = () => scroller.current?.scrollBy({ top: scroller.current.clientHeight, behavior: "smooth" });

  return (
    <div data-theme="dark" className="relative flex min-h-0 flex-1 flex-col bg-black text-white md:bg-canvas md:text-fg">
      <div className="absolute inset-x-0 top-0 z-nav flex items-center gap-1 bg-gradient-to-b from-black/60 to-transparent px-2 pb-6 pt-safe md:static md:bg-none md:px-4 md:pb-0 md:pt-3">
        <IconButton icon={ArrowLeft} label="Back to Flicks" tone="overlay" onClick={() => goBack("/flicks")} />
        <h1 className="text-title-3">Short Flicks</h1>
      </div>

      {error && <div className="flex flex-1 items-center justify-center"><ErrorState title="Couldn't load Flicks" onRetry={load} /></div>}

      {!error && videos === null && (
        <div role="status" className="flex flex-1 items-center justify-center text-fg-muted">
          <Spinner size={28} /><span className="sr-only">Loading Flicks…</span>
        </div>
      )}

      {!error && videos?.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={Clapperboard} title="No short Flicks yet" body="Short videos play here in full, one at a time."
            action={<Button onClick={() => goBack("/flicks")}>Back to Flicks</Button>} />
        </div>
      )}

      {videos?.length > 0 && (
        <div ref={scroller} data-scroll aria-label="Flicks"
          className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto no-scrollbar overscroll-contain">
          {videos.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 && i % CHECKPOINT === 0 && <Checkpoint count={i} startedAt={startedAt} onContinue={next} />}
              <FlickItem post={p} index={i} total={videos.length} viewer={viewer} onViewerChange={setViewer}
                muted={muted} onToggleSound={toggleSound} onRemoved={(id) => setVideos((l) => l.filter((x) => x.id !== id))} />
            </Fragment>
          ))}
          <EndCard count={videos.length} />
        </div>
      )}
    </div>
  );
}

const STOP = "flex h-full w-full shrink-0 snap-start snap-always flex-col items-center justify-center gap-2 px-8 text-center";

// A natural stopping point: how many Flicks and roughly how long, with an easy way out.
function Checkpoint({ count, startedAt, onContinue }) {
  const ref = useRef(null);
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setMinutes(Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [startedAt]);
  return (
    <section ref={ref} aria-label="Check-in" className={STOP}>
      <Hourglass size={30} className="mb-2 text-white/70 md:text-fg-muted" aria-hidden="true" />
      <p className="text-title-2">You've watched {count} Flicks</p>
      {minutes > 0 && <p className="text-callout text-white/70 md:text-fg-muted">About {plural(minutes, "minute")} so far.</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={onContinue}>Keep watching</Button>
        <Button onClick={() => goBack("/flicks")}>I'm done</Button>
      </div>
      <button type="button" onClick={() => navigate("/account/brick")}
        className="mt-2 inline-flex min-h-9 items-center text-caption text-white/70 underline underline-offset-2 hover:text-white md:text-fg-muted md:hover:text-fg">
        Set a daily limit for Flicks
      </button>
    </section>
  );
}

function EndCard({ count }) {
  return (
    <section aria-label="End of Flicks" className={STOP}>
      <CheckCheck size={30} className="mb-2 text-white/70 md:text-fg-muted" aria-hidden="true" />
      <p className="text-title-2">You're all caught up</p>
      <p className="text-callout text-white/70 md:text-fg-muted">That's all {plural(count, "short Flick")} for now.</p>
      <Button className="mt-4" onClick={() => goBack("/flicks")}>Back to Flicks</Button>
    </section>
  );
}

function FlickItem({ post, index, total, viewer, onViewerChange, muted, onToggleSound, onRemoved }) {
  const { following, setFollowing, needsAccount } = useShell();
  const toast = useToast();
  const box = useRef(null);
  const video = useRef(null);
  const [near, setNear] = useState(index < 2);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [burst, setBurst] = useState(false);
  const [counts, setCounts] = useState({
    like: post.likeCount || 0, comment: post.commentCount || 0, repost: post.repostCount || 0,
  });
  const signals = useRef({ viewed: false, loops: 0, since: 0, last: 0 });
  const tapTimer = useRef(null);

  const liked = viewer.liked.has(post.id);
  const saved = viewer.saved.has(post.id);
  const reposted = viewer.reposted.has(post.id);
  const mine = post.authorId === me();
  const followsAuthor = following.has(post.authorId);

  // One observer preloads a screen ahead; the other picks the playing item.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const nearIO = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "100% 0px" });
    const activeIO = new IntersectionObserver(([e]) => setActive(e.intersectionRatio >= 0.7), { threshold: [0, 0.7] });
    nearIO.observe(el);
    activeIO.observe(el);
    return () => { nearIO.disconnect(); activeIO.disconnect(); };
  }, []);

  // Unload far-away sources to free hardware decoders.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (near && !el.getAttribute("src")) {
      el.setAttribute("src", post.mediaUrl);
      el.load();
    } else if (!near && el.getAttribute("src")) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [near, post.mediaUrl]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const s = signals.current;
    if (active) {
      setPaused(false);
      el.play().catch(() => {});
      s.since = Date.now();
      const t = setTimeout(() => {
        if (!s.viewed) { s.viewed = true; recordSignal(post, "view").catch(() => {}); }
      }, 2000);
      return () => clearTimeout(t);
    }
    el.pause();
    // Leaving within 1.5s counts as a skip signal.
    if (s.since && Date.now() - s.since < 1500 && !s.viewed) recordSignal(post, "skip").catch(() => {});
    s.since = 0;
  }, [active, post]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const onTime = () => {
    const el = video.current;
    if (!el) return;
    const s = signals.current;
    if (s.last > 1 && el.currentTime < s.last - 1) {
      s.loops += 1;
      recordSignal(post, s.loops === 1 ? "complete" : "replay").catch(() => {});
    }
    s.last = el.currentTime;
    setProgress(el.duration > 0 ? Math.min(1, el.currentTime / el.duration) : 0);
  };

  const togglePlay = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPaused(false); setFlash("play"); }
    else { el.pause(); setPaused(true); setFlash("pause"); }
    setTimeout(() => setFlash(null), 500);
  };

  // Single tap (delayed) pauses; double tap likes.
  const onTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (needsAccount("like posts")) return;
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      if (!liked) act("like");
      return;
    }
    tapTimer.current = setTimeout(() => { tapTimer.current = null; togglePlay(); }, 240);
  };

  const pending = useRef({});
  const act = async (what) => {
    if (needsAccount({ like: "like posts", save: "save posts", repost: "repost" }[what])) return;
    if (pending.current[what]) return;
    const map = {
      like: ["liked", liked, () => toggleLike(post, liked), "like"],
      save: ["saved", saved, () => toggleSave(post, saved), null],
      repost: ["reposted", reposted, () => toggleRepost(post, reposted), "repost"],
    };
    const [field, current, write, countKey] = map[what];
    if (what === "repost" && (mine || post.visibility !== "public")) {
      return toast({ tone: "info", title: mine ? "You can't repost your own Flick" : "Only public posts can be reposted" });
    }
    pending.current[what] = true;
    onViewerChange(post.id, field, !current);
    if (countKey) setCounts((c) => ({ ...c, [countKey]: Math.max(0, c[countKey] + (current ? -1 : 1)) }));
    try {
      await write();
      if (what === "repost" && !current) toast({ title: "Reposted to your followers" });
      if (what === "save" && !current) toast({ title: "Saved" });
    } catch {
      onViewerChange(post.id, field, current);
      if (countKey) setCounts((c) => ({ ...c, [countKey]: Math.max(0, c[countKey] + (current ? 1 : -1)) }));
      toast({ tone: "error", title: "That didn't go through", body: "Check your connection and try again." });
    } finally {
      pending.current[what] = false;
    }
  };

  const follow = async () => {
    if (needsAccount("follow people")) return;
    try {
      await toggleFollow({ id: post.authorId, username: post.authorName }, false);
      setFollowing((prev) => new Set(prev).add(post.authorId));
      toast({ title: `Following @${post.authorName}` });
    } catch {
      toast({ tone: "error", title: "Couldn't follow right now" });
    }
  };

  const rail = "flex flex-col items-center gap-1 text-white md:text-fg";
  const railBtn = "press flex h-12 w-12 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm md:bg-surface-2 md:backdrop-blur-none hover:bg-black/40 md:hover:bg-surface-3";

  return (
    <section ref={box} aria-roledescription="Flick" aria-label={`${index + 1} of ${total}: Flick by @${post.authorName}`}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center md:gap-4 md:py-4">
      <div className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:h-full md:w-auto md:max-w-full md:rounded-card">
        <video ref={video} muted={muted} loop playsInline preload="none" poster={post.posterUrl || undefined} aria-label={`Flick by @${post.authorName}`}
          onTimeUpdate={onTime} onError={() => { if (video.current?.getAttribute("src")) setFailed(true); }}
          onClick={onTap} className="h-full w-full cursor-pointer object-contain" />

        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-center">
            <p className="text-callout text-fg-muted">This video couldn't play.</p>
            <Button size="sm" onClick={() => { setFailed(false); video.current?.load(); }}>Try again</Button>
          </div>
        )}

        {flash && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 anim-pop">
              {flash === "pause" ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
            </span>
          </span>
        )}
        {burst && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Heart size={110} className="anim-pop text-white drop-shadow-lg" fill="currentColor" />
          </span>
        )}

        <div className="absolute right-2 top-[calc(64px+env(safe-area-inset-top))] flex flex-col gap-2 md:top-3">
          <button type="button" onClick={onToggleSound} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}
            className="press flex h-11 items-center gap-1.5 rounded-full bg-black/45 px-3 text-caption font-semibold text-white backdrop-blur">
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            {muted && <span>Tap for sound</span>}
          </button>
          <button type="button" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}
            className="press flex h-11 w-11 items-center justify-center self-end rounded-full bg-black/45 text-white backdrop-blur">
            {paused ? <Play size={18} fill="currentColor" aria-hidden="true" /> : <Pause size={18} fill="currentColor" aria-hidden="true" />}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-5 pt-24 pr-20 md:pr-4">
          <div className="pointer-events-auto">
            <button type="button" onClick={() => openUserProfile(post.authorId)} className="text-callout font-semibold text-white hover:underline">
              @{post.authorName}
              <span className="ml-2 font-normal text-white/70">{shortTime(post.createdAt)}{post.editedAt ? " · Edited" : ""}</span>
            </button>
            {post.aiGenerated && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-label font-semibold text-white">
                <WandSparkles size={12} aria-hidden="true" /> Made with AI
              </span>
            )}
            {post.text && (
              <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}
                className={`mt-1 block text-left text-callout text-white/90 ${expanded ? "" : "line-clamp-2"}`}>
                {post.text}
              </button>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20" aria-hidden="true">
          <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 md:static md:self-end md:pb-6">
        <div className="relative mb-2">
          <button type="button" onClick={() => openUserProfile(post.authorId)} aria-label={`@${post.authorName}'s profile`}
            className="press rounded-full ring-2 ring-white md:ring-line-strong">
            <Avatar profile={{ username: post.authorName, name: post.authorDisplayName, photoURL: post.authorPhoto }} size={44} />
          </button>
          {!mine && !followsAuthor && (
            <button type="button" onClick={follow} aria-label={`Follow @${post.authorName}`}
              className="press absolute -bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-white ring-2 ring-black md:ring-canvas">
              <Plus size={14} strokeWidth={3} aria-hidden="true" />
            </button>
          )}
          {!mine && followsAuthor && (
            <span className="absolute -bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-white text-black" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
          )}
        </div>

        <div className={rail}>
          <button type="button" onClick={() => act("like")} aria-pressed={liked}
            aria-label={`${liked ? "Unlike" : "Like"}, ${counts.like} like${counts.like === 1 ? "" : "s"}`} className={railBtn}>
            <Heart size={26} aria-hidden="true" fill={liked ? "currentColor" : "none"} className={liked ? "text-like" : ""} />
          </button>
          <span className="text-label font-semibold tabular drop-shadow" aria-hidden="true">{compact(counts.like)}</span>
        </div>
        <div className={rail}>
          <button type="button" onClick={() => setSheet("comments")}
            aria-label={`Comments, ${counts.comment} comment${counts.comment === 1 ? "" : "s"}`} className={railBtn}>
            <MessageCircle size={26} aria-hidden="true" />
          </button>
          <span className="text-label font-semibold tabular drop-shadow" aria-hidden="true">{compact(counts.comment)}</span>
        </div>
        <div className={rail}>
          <button type="button" onClick={() => act("repost")} aria-pressed={reposted}
            aria-label={`${reposted ? "Undo repost" : "Repost"}, ${counts.repost} repost${counts.repost === 1 ? "" : "s"}`} className={railBtn}>
            <Repeat2 size={26} aria-hidden="true" className={reposted ? "text-success-text" : ""} />
          </button>
          <span className="text-label font-semibold tabular drop-shadow" aria-hidden="true">{compact(counts.repost)}</span>
        </div>
        <div className={rail}>
          <button type="button" onClick={() => act("save")} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save"} className={railBtn}>
            <Bookmark size={24} aria-hidden="true" fill={saved ? "currentColor" : "none"} className={saved ? "text-accent-ring" : ""} />
          </button>
        </div>
        <div className={rail}>
          <button type="button" onClick={() => setSheet("share")} aria-label="Share" className={railBtn}>
            <Send size={24} aria-hidden="true" />
          </button>
        </div>
        <div className={rail}>
          <button type="button" onClick={() => setSheet("menu")} aria-label="More options" className={railBtn}>
            <Ellipsis size={24} aria-hidden="true" />
          </button>
        </div>
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && <ShareSheet post={post} onClose={() => setSheet(null)} />}
      {sheet === "menu" && (
        <PostMenu post={post} mine={mine} onClose={() => setSheet(null)} onRemoved={() => onRemoved?.(post.id)} />
      )}
    </section>
  );
}
