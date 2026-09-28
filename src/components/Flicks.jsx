import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Play, Pause, Volume2, VolumeX, Plus, Check, Clapperboard, WandSparkles,
} from "lucide-react";
import {
  fetchVideos, fetchPost, fetchAffinity, toggleLike, toggleSave, toggleRepost, toggleFollow, fetchTopicPosts,
  recordSignal, openUserProfile, openWatch, me, TRAILER_SECONDS,
} from "../lib/db";
import { rankFeed } from "../lib/algorithm";
import { usePostStates } from "../lib/usePostStates";
import { formatDuration, shortTime, compact } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import { InterestChips } from "./Interests";
import { interestById } from "../lib/interests";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet } from "./PostActions";

// Sound is a choice you make once per visit, not once per video.
let soundOn = false;

/* Flicks: every video on Mesh in one vertical feed.

   Short Flicks (three minutes or less) play in full and loop. Long ones play
   a 30-second trailer cut from the full video, then offer the whole thing,
   so long-form gets discovered where people are already watching, and you
   decide whether it's worth your next twenty minutes. */
export default function Flicks({ startId }) {
  const { following, blocked, interests, openInterests, hiddenWords } = useShell();
  const [topic, setTopic] = useState("all");
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState(false);
  const [viewer, setViewer] = usePostStates(videos);
  const [muted, setMuted] = useState(!soundOn);
  const scroller = useRef(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [all, affinity] = await Promise.all([
        topic === "all" ? fetchVideos() : fetchTopicPosts(topic).then((l) => l.filter((p) => p.kind === "short" || p.kind === "video")),
        fetchAffinity().catch(() => new Map()),
      ]);
      const list = all.filter((p) => !blocked.has(p.authorId));
      let ordered = rankFeed(list, { followingSet: following, affinity, myUid: me(), interests, hiddenWords });
      if (startId) {
        const start = ordered.find((p) => p.id === startId) || (await fetchPost(startId).catch(() => null));
        if (start && (start.kind === "short" || start.kind === "video")) {
          ordered = [start, ...ordered.filter((p) => p.id !== startId)];
        }
      }
      setVideos(ordered);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    // startId only matters on arrival; re-ranking when it changes would reshuffle under the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, blocked, topic, interests, hiddenWords]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const toggleSound = () => {
    soundOn = !soundOn;
    setMuted(!soundOn);
  };

  // Up/Down (or J/K) step between Flicks, like every vertical video app.
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black text-white md:bg-canvas md:text-fg">
      <HomeHeader section="flicks" transparent>
        <InterestChips interests={interests} value={topic} onEdit={openInterests} overlay
          onChange={(t) => { setTopic(t); setVideos(null); scroller.current?.scrollTo({ top: 0 }); }} />
      </HomeHeader>

      {error && <div className="flex flex-1 items-center justify-center"><ErrorState title="Couldn't load Flicks" onRetry={load} /></div>}

      {!error && videos === null && (
        <div role="status" className="flex flex-1 items-center justify-center text-fg-muted">
          <Spinner size={28} /><span className="sr-only">Loading Flicks…</span>
        </div>
      )}

      {!error && videos?.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={Clapperboard}
            title={topic === "all" ? "No Flicks yet" : `No ${interestById(topic)?.label || ""} Flicks yet`}
            body={topic === "all" ? "Short videos play here in full. Long ones play a trailer, then open to the whole thing." : "Flicks tagged with this interest show here."}
            action={topic === "all" ? <CreateFlickButton /> : <Button onClick={() => setTopic("all")}>Show all Flicks</Button>} />
        </div>
      )}

      {videos?.length > 0 && (
        <div ref={scroller} data-scroll aria-label="Flicks"
          className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto no-scrollbar overscroll-contain">
          {videos.map((p, i) => (
            <FlickItem key={p.id} post={p} index={i} total={videos.length} viewer={viewer} onViewerChange={setViewer}
              muted={muted} onToggleSound={toggleSound} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateFlickButton() {
  const { openComposer } = useShell();
  return <Button variant="brand" icon={Plus} onClick={() => openComposer({ kind: "video" })}>Post a Flick</Button>;
}

function FlickItem({ post, index, total, viewer, onViewerChange, muted, onToggleSound }) {
  const { following, setFollowing } = useShell();
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

  const long = post.kind === "video";
  const start = long ? post.trailerStart || 0 : 0;
  const liked = viewer.liked.has(post.id);
  const saved = viewer.saved.has(post.id);
  const reposted = viewer.reposted.has(post.id);
  const mine = post.authorId === me();
  const followsAuthor = following.has(post.authorId);

  // Two observers: one loads the source a screen ahead, one decides who plays.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const nearIO = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "100% 0px" });
    const activeIO = new IntersectionObserver(([e]) => setActive(e.intersectionRatio >= 0.7), { threshold: [0, 0.7] });
    nearIO.observe(el);
    activeIO.observe(el);
    return () => { nearIO.disconnect(); activeIO.disconnect(); };
  }, []);

  // Leaving the neighbourhood releases the decoder; phones only have a few.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (near && !el.getAttribute("src")) {
      el.setAttribute("src", `${post.mediaUrl}#t=${start}`);
      el.load();
    } else if (!near && el.getAttribute("src")) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [near, post.mediaUrl, start]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const s = signals.current;
    if (active) {
      setPaused(false);
      if (el.currentTime < start) el.currentTime = start;
      el.play().catch(() => {});
      s.since = Date.now();
      const t = setTimeout(() => {
        if (!s.viewed) { s.viewed = true; recordSignal(post, "view").catch(() => {}); }
      }, 2000);
      return () => clearTimeout(t);
    }
    el.pause();
    // Swiping away inside a second and a half is a skip: the clearest
    // "not for me" signal a vertical feed gets.
    if (s.since && Date.now() - s.since < 1500 && !s.viewed) recordSignal(post, "skip").catch(() => {});
    s.since = 0;
  }, [active, post, start]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const onTime = () => {
    const el = video.current;
    if (!el) return;
    const s = signals.current;
    const end = long ? Math.min(start + TRAILER_SECONDS, el.duration || Infinity) : el.duration || 0;
    if (long && el.currentTime >= end) el.currentTime = start;
    // Detect a loop wrap: time jumped back to the start.
    if (!long && s.last > 1 && el.currentTime < s.last - 1) {
      s.loops += 1;
      recordSignal(post, s.loops === 1 ? "complete" : "replay").catch(() => {});
    }
    s.last = el.currentTime;
    const span = end - start;
    setProgress(span > 0 ? Math.min(1, (el.currentTime - start) / span) : 0);
  };

  const togglePlay = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPaused(false); setFlash("play"); }
    else { el.pause(); setPaused(true); setFlash("pause"); }
    setTimeout(() => setFlash(null), 500);
  };

  // Single tap pauses; double tap likes. The single tap waits a beat so a
  // double tap doesn't also pause.
  const onTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      if (!liked) act("like");
      return;
    }
    tapTimer.current = setTimeout(() => { tapTimer.current = null; togglePlay(); }, 240);
  };

  const pending = useRef({});
  const act = async (what) => {
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
    <section ref={box} aria-roledescription="Flick" aria-label={`${index + 1} of ${total}: ${long ? post.title || "Long Flick" : `Flick by @${post.authorName}`}`}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center md:gap-4 md:py-4">
      <div className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:h-full md:w-auto md:max-w-full md:rounded-card">
        <video ref={video} muted={muted} loop={!long} playsInline preload="none"
          aria-label={long ? `Trailer for ${post.title || "a video"}` : `Flick by @${post.authorName}`}
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

        {/* Caption and, for long Flicks, the way through to the full video */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-5 pt-24 pr-20 md:pr-4">
          <div className="pointer-events-auto">
            <button type="button" onClick={() => openUserProfile(post.authorId)} className="text-callout font-semibold text-white hover:underline">
              @{post.authorName}
              <span className="ml-2 font-normal text-white/70">{shortTime(post.createdAt)}</span>
            </button>
            {post.aiGenerated && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-label font-semibold text-white">
                <WandSparkles size={12} aria-hidden="true" /> Made with AI
              </span>
            )}
            {long && (
              <>
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-label font-semibold text-white">Trailer</span>
                {post.title && <p className="mt-1 text-title-3 text-white">{post.title}</p>}
              </>
            )}
            {post.text && (
              <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}
                className={`mt-1 block text-left text-callout text-white/90 ${expanded ? "" : "line-clamp-2"}`}>
                {post.text}
              </button>
            )}
            {long && (
              <button type="button" onClick={() => openWatch(post.id)}
                className="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-callout font-semibold text-black hover:bg-white/90">
                <Play size={16} fill="currentColor" aria-hidden="true" />
                Watch the full video{post.duration > 0 ? ` · ${formatDuration(post.duration)}` : ""}
              </button>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20" aria-hidden="true">
          <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Actions: over the video on phones, beside it on desktop */}
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
            <Heart size={26} aria-hidden="true" fill={liked ? "currentColor" : "none"} className={liked ? "text-fuchsia-400" : ""} />
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
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && <ShareSheet post={post} onClose={() => setSheet(null)} />}
    </section>
  );
}
