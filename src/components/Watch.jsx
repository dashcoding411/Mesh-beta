import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Send, Bookmark, UserPlus, UserCheck, Clapperboard, WandSparkles, Play, RotateCcw,
  Gauge, ListOrdered,
} from "lucide-react";
import {
  fetchPost, fetchPostsByKind, fetchHiddenPostIds, toggleLike, toggleSave, toggleRepost, toggleFollow,
  recordSignal, openUserProfile, openWatch, me, tsMillis, limitMessage,
} from "../lib/db";
import { goBack } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { chapterAt, parseChapters } from "../lib/chapters";
import { formatDuration, shortTime, fullTime, spokenDuration } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import Badge from "./ui/Badge";
import Switch from "./ui/Switch";
import { EmptyState, Skeleton, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { usePageTitle } from "../lib/usePageTitle";
import { ShareSheet } from "./PostActions";
import VideoFrame from "./post/VideoFrame";
import { useFocusTrap } from "../lib/useFocusTrap";

const RATES = [0.75, 1, 1.25, 1.5, 2];
const AUTOPLAY_KEY = "mesh:autoplay";
const readAutoplay = () => { try { return localStorage.getItem(AUTOPLAY_KEY) === "1"; } catch { return false; } };

// Up next: more from the same creator, then shared topics, then newest.
function upNext(current, list, hidden, { hiddenAuthors, hideAi }) {
  const shared = (v) => (v.topics || []).filter((t) => (current.topics || []).includes(t)).length;
  return list
    .filter((v) => v.id !== current.id && !hidden.has(v.id) && !hiddenAuthors.has(v.authorId) && !(hideAi && v.aiGenerated))
    .map((v) => ({ v, score: (v.authorId === current.authorId ? 4 : 0) + shared(v) * 2 }))
    .sort((a, b) => b.score - a.score || tsMillis(b.v.createdAt) - tsMillis(a.v.createdAt))
    .slice(0, 8)
    .map((x) => x.v);
}

// The long-form player. Native controls give keyboard, captions, fullscreen
// and picture-in-picture. Autoplay is off unless the viewer turns it on.
export default function Watch({ postId }) {
  const trap = useFocusTrap();
  const { following, setFollowing, needsAccount, hiddenAuthors, hideAi } = useShell();
  const toast = useToast();
  const [post, setPost] = useState(undefined);
  usePageTitle(post ? post.title || `Video by @${post.authorName}` : null, 2);
  const [more, setMore] = useState(null);
  const [viewer, setViewer] = usePostStates(post ? [post] : []);
  const [sheet, setSheet] = useState(null);
  const [counts, setCounts] = useState(null);
  const video = useRef(null);
  const heading = useRef(null);
  const watched = useRef({ view: false, done: false });
  const [rate, setRate] = useState(1);
  const [chapter, setChapter] = useState(0);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const [skipNext, setSkipNext] = useState(false); // this countdown was cancelled

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchPost(postId),
      fetchPostsByKind("video").catch(() => []),
      fetchHiddenPostIds().catch(() => new Set()),
    ]).then(([p, list, hidden]) => {
      if (cancelled) return;
      setPost(p);
      if (p) setCounts({ like: p.likeCount || 0, comment: p.commentCount || 0, repost: p.repostCount || 0 });
      setMore(p ? upNext(p, list, hidden, { hiddenAuthors, hideAi }) : []);
    }).catch(() => { if (!cancelled) { setPost(null); setMore([]); } });
    return () => { cancelled = true; };
    // Up next is worked out once per video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const next = more?.[0] || null;
  // When autoplay is on, the next video starts five seconds after this one ends.
  useEffect(() => {
    if (!ended || !autoplay || skipNext || !next) return undefined;
    let left = 5;
    setCountdown(left);
    const t = setInterval(() => {
      left -= 1;
      if (left > 0) return setCountdown(left);
      clearInterval(t);
      openWatch(next.id);
    }, 1000);
    return () => { clearInterval(t); setCountdown(null); };
  }, [ended, autoplay, skipNext, next]);

  const changeAutoplay = (on) => {
    setAutoplay(on);
    try { localStorage.setItem(AUTOPLAY_KEY, on ? "1" : "0"); } catch { /* storage blocked: this visit only */ }
  };
  const changeRate = (r) => {
    setRate(r);
    if (video.current) video.current.playbackRate = r;
  };
  const replay = () => {
    const el = video.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  };
  const chapters = post ? parseChapters(post.text) : [];
  const seekTo = (at) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = at;
    el.play().catch(() => {});
  };

  useEffect(() => {
    const opener = document.activeElement;
    // This page is a dialog itself; Escape only leaves when nothing is open on top.
    const onKey = (e) => { if (e.key === "Escape" && document.querySelectorAll("[role=dialog]").length <= 1) goBack("/flicks"); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => { if (post) heading.current?.focus(); }, [post]);

  const onTime = () => {
    const el = video.current;
    if (!el || !post) return;
    if (chapters.length) {
      const i = chapterAt(chapters, el.currentTime);
      if (i !== chapter) setChapter(i);
    }
    if (!watched.current.view && el.currentTime > 10) {
      watched.current.view = true;
      recordSignal(post, "view").catch(() => {});
    }
  };

  const liked = post && viewer.liked.has(post.id);
  const saved = post && viewer.saved.has(post.id);
  const reposted = post && viewer.reposted.has(post.id);
  const followsAuthor = post && following.has(post.authorId);
  const mine = post?.authorId === me();

  const act = async (field, current, write, countKey) => {
    if (needsAccount({ liked: "like posts", saved: "save posts", reposted: "repost" }[field])) return;
    setViewer(post.id, field, !current);
    if (countKey) setCounts((c) => ({ ...c, [countKey]: Math.max(0, c[countKey] + (current ? -1 : 1)) }));
    try { await write(); }
    catch {
      setViewer(post.id, field, current);
      if (countKey) setCounts((c) => ({ ...c, [countKey]: Math.max(0, c[countKey] + (current ? 1 : -1)) }));
      toast({ tone: "error", title: "That didn't go through", body: "Check your connection and try again." });
    }
  };

  const follow = async () => {
    if (needsAccount("follow people")) return;
    try {
      await toggleFollow({ id: post.authorId, username: post.authorName }, followsAuthor);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (followsAuthor) next.delete(post.authorId); else next.add(post.authorId);
        return next;
      });
    } catch (err) { toast({ tone: "error", title: limitMessage(err) || "Couldn't update follow" }); }
  };

  return (
    <div ref={trap} role="dialog" aria-modal="true" aria-label={post?.title || "Video"}
      className="fixed inset-0 z-overlay overflow-y-auto overflow-x-hidden scroll-pt-16 bg-canvas anim-fade">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur glass-solid">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/flicks")} />
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{post?.title || "Watch"}</p>
      </header>

      {post === undefined && (
        <div className="mx-auto max-w-6xl p-4 md:p-6" role="status" aria-label="Loading video">
          <Skeleton className="aspect-video w-full !rounded-card" />
          <Skeleton className="mt-4 h-6 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/3" />
        </div>
      )}

      {post === null && (
        <EmptyState icon={Clapperboard} title="This video isn't available"
          body="It may have been deleted, or it's followers-only and you don't follow the creator."
          action={<Button onClick={() => goBack("/flicks")}>Back to Flicks</Button>} />
      )}

      {post && (
        <div className="mx-auto grid max-w-6xl gap-8 p-0 pb-16 md:p-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="relative isolate">
              <Ambient video={video} />
              <div className="relative bg-black md:overflow-hidden md:rounded-card">
                <video ref={video} src={post.mediaUrl} poster={post.posterUrl || undefined} controls autoPlay playsInline preload="auto"
                  onTimeUpdate={onTime} onPlay={() => { setEnded(false); setSkipNext(false); }}
                  onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
                  onEnded={() => {
                    setEnded(true);
                    if (!watched.current.done) { watched.current.done = true; recordSignal(post, "complete").catch(() => {}); }
                  }}
                  aria-label={post.title || "Video"} className="aspect-video w-full bg-black" />
                {ended && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-white anim-fade">
                    {next && (
                      <>
                        <p className="text-label font-semibold uppercase tracking-wider text-white/70">
                          Up next{countdown ? ` in ${countdown}` : ""}
                        </p>
                        <p className="line-clamp-2 max-w-md text-title-3">{next.title || "Untitled"}</p>
                      </>
                    )}
                    <div className="flex gap-2">
                      {next && <Button variant="primary" icon={Play} onClick={() => openWatch(next.id)}>Play</Button>}
                      {countdown
                        ? <Button onClick={() => setSkipNext(true)}>Cancel</Button>
                        : <Button icon={RotateCcw} onClick={replay}>Replay</Button>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 md:px-0">
              <h1 ref={heading} tabIndex={-1} className="mt-4 text-title-1 outline-none">{post.title || "Untitled"}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
                <time title={fullTime(post.createdAt)}>{shortTime(post.createdAt)}</time>
                {post.editedAt && <span title={`Edited ${fullTime(post.editedAt)}`}>· Edited</span>}
                {post.duration > 0 && <span>· {spokenDuration(post.duration)}</span>}
                {post.aiGenerated && <Badge icon={WandSparkles}>Edited with AI</Badge>}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => openUserProfile(post.authorId)} className="press flex min-w-0 items-center gap-3 rounded-control pr-2 text-left">
                  <Avatar profile={{ username: post.authorName, name: post.authorDisplayName, photoURL: post.authorPhoto }} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-callout font-semibold">{post.authorDisplayName || post.authorName}</span>
                    <span className="block truncate text-caption text-fg-subtle">@{post.authorName}</span>
                  </span>
                </button>
                {!mine && (
                  <Button size="sm" variant={followsAuthor ? "secondary" : "primary"} icon={followsAuthor ? UserCheck : UserPlus} onClick={follow}>
                    {followsAuthor ? "Following" : "Follow"}
                  </Button>
                )}
              </div>

              <div className="-ml-2.5 mt-3 flex flex-wrap items-center" role="group" aria-label="Video actions">
                <IconButton icon={Heart} label={liked ? "Unlike" : "Like"} pressed={liked} count={counts.like} countNoun="like"
                  activeClass="text-like" onClick={() => act("liked", liked, () => toggleLike(post, liked), "like")} />
                <IconButton icon={MessageCircle} label="Comments" count={counts.comment} countNoun="comment" onClick={() => setSheet("comments")} />
                <IconButton icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} pressed={reposted} count={counts.repost} countNoun="repost"
                  activeClass="text-success-text" aria-disabled={mine || post.visibility !== "public" || undefined}
                  className={mine || post.visibility !== "public" ? "opacity-45" : ""}
                  onClick={() => mine || post.visibility !== "public"
                    ? toast({ tone: "info", title: mine ? "You can't repost your own video" : "Only public posts can be reposted" })
                    : act("reposted", reposted, () => toggleRepost(post, reposted), "repost")} />
                <IconButton icon={Send} label="Share" onClick={() => setSheet("share")} />
                <IconButton icon={Bookmark} label={saved ? "Remove from saved" : "Save"} pressed={saved} activeClass="text-accent-text"
                  onClick={() => act("saved", saved, () => toggleSave(post, saved))} />
                <label className="ml-2 inline-flex min-h-11 items-center gap-1.5 text-caption text-fg-muted">
                  <Gauge size={18} aria-hidden="true" />
                  <span className="sr-only">Playback speed</span>
                  <select value={rate} onChange={(e) => changeRate(Number(e.target.value))}
                    className="field min-h-9 rounded-control border border-field bg-surface-2 px-2 text-caption text-fg">
                    {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
                  </select>
                </label>
              </div>

              {chapters.length > 0 && (
                <section aria-labelledby="chapters-h" className="mt-4 rounded-card border border-line">
                  <h2 id="chapters-h" className="flex items-center gap-2 px-4 pt-3 text-callout font-semibold">
                    <ListOrdered size={16} aria-hidden="true" /> Chapters
                  </h2>
                  <ol className="p-1.5">
                    {chapters.map((c, i) => (
                      <li key={c.at}>
                        <button type="button" onClick={() => seekTo(c.at)} aria-current={i === chapter ? "true" : undefined}
                          className={`press flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 text-left text-callout ${
                            i === chapter ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                          }`}>
                          <span className="w-14 shrink-0 tabular text-accent-text">{formatDuration(c.at)}</span>
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {post.text && (
                <div className="mt-4 rounded-card bg-surface p-4">
                  <RichText text={post.text} plainLinks={!!post.fresh} className="text-callout text-fg" />
                </div>
              )}
            </div>
          </div>

          <aside aria-labelledby="more-long" className="px-4 md:px-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="more-long" className="text-title-3">Up next</h2>
              <span className="flex items-center gap-2 text-caption text-fg-muted">
                <span aria-hidden="true">Autoplay</span>
                <Switch label="Autoplay the next video" checked={autoplay} onChange={changeAutoplay} />
              </span>
            </div>
            {more === null && <div className="flex justify-center py-6 text-fg-muted"><Spinner /></div>}
            {more?.length === 0 && <p className="text-callout text-fg-muted">Nothing else yet.</p>}
            <ul className="space-y-3">
              {more?.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => openWatch(v.id)} className="press group flex w-full gap-3 rounded-control text-left">
                    <span className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-control bg-surface-2">
                      <VideoFrame post={v} />
                      {v.duration > 0 && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-label font-semibold text-white tabular">
                          {formatDuration(v.duration)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 py-0.5">
                      <span className="line-clamp-2 text-callout font-semibold group-hover:underline">{v.title || "Untitled"}</span>
                      <span className="mt-1 block truncate text-caption text-fg-subtle">@{v.authorName}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {sheet === "comments" && post && (
        <Comments post={post} onClose={() => setSheet(null)}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && post && <ShareSheet post={post} onClose={() => setSheet(null)} />}
    </div>
  );
}

// Ambient glow: a tiny, blurred copy of the current frame behind the player.
// Drawing a cross-origin video to a canvas is allowed; only reading it back
// isn't, and this never does. Repaints while playing unless motion is reduced.
function Ambient({ video }) {
  const canvas = useRef(null);
  useEffect(() => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c) return undefined;
    const ctx = c.getContext("2d");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let timer = null;
    const draw = () => { try { ctx.drawImage(v, 0, 0, c.width, c.height); } catch { /* no frame yet */ } };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { stop(); draw(); if (!still) timer = setInterval(draw, 400); };
    const events = [["play", start], ["pause", stop], ["ended", stop], ["seeked", draw], ["loadeddata", draw]];
    events.forEach(([e, fn]) => v.addEventListener(e, fn));
    return () => { stop(); events.forEach(([e, fn]) => v.removeEventListener(e, fn)); };
  }, [video]);
  return (
    <canvas ref={canvas} width={32} height={18} aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full scale-110 opacity-60 blur-3xl saturate-150 md:block" />
  );
}
