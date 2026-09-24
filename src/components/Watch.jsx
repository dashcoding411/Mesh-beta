import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, MessageCircle, Repeat2, Send, Bookmark, UserPlus, UserCheck, Clapperboard, WandSparkles } from "lucide-react";
import {
  fetchPost, fetchPostsByKind, toggleLike, toggleSave, toggleRepost, toggleFollow,
  recordSignal, openUserProfile, openWatch, me,
} from "../lib/db";
import { goBack } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { formatDuration, shortTime, fullTime, spokenDuration } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import RichText from "./ui/RichText";
import Badge from "./ui/Badge";
import { EmptyState, Skeleton, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet } from "./PostActions";

/* The full-length player for long Flicks, where a trailer leads when you
   decide it's worth your time. Native controls on purpose: they bring
   keyboard control, captions, fullscreen and picture-in-picture for free,
   and every screen reader already knows them. */
export default function Watch({ postId }) {
  const { following, setFollowing } = useShell();
  const toast = useToast();
  const [post, setPost] = useState(undefined);
  const [more, setMore] = useState(null);
  const [viewer, setViewer] = usePostStates(post ? [post] : []);
  const [sheet, setSheet] = useState(null);
  const [counts, setCounts] = useState(null);
  const video = useRef(null);
  const heading = useRef(null);
  const watched = useRef({ view: false, done: false });

  useEffect(() => {
    let cancelled = false;
    fetchPost(postId)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        if (p) setCounts({ like: p.likeCount || 0, comment: p.commentCount || 0, repost: p.repostCount || 0 });
      })
      .catch(() => { if (!cancelled) setPost(null); });
    fetchPostsByKind("video").then((l) => { if (!cancelled) setMore(l.filter((v) => v.id !== postId).slice(0, 8)); }).catch(() => setMore([]));
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) goBack("/flicks"); };
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
    try {
      await toggleFollow({ id: post.authorId, username: post.authorName }, followsAuthor);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (followsAuthor) next.delete(post.authorId); else next.add(post.authorId);
        return next;
      });
    } catch { toast({ tone: "error", title: "Couldn't update follow" }); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={post?.title || "Video"}
      className="fixed inset-0 z-overlay overflow-y-auto bg-canvas anim-fade">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
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
            <div className="relative bg-black md:overflow-hidden md:rounded-card">
              <video ref={video} src={post.mediaUrl} controls autoPlay playsInline preload="auto"
                onTimeUpdate={onTime}
                onEnded={() => { if (!watched.current.done) { watched.current.done = true; recordSignal(post, "complete").catch(() => {}); } }}
                aria-label={post.title || "Video"} className="aspect-video w-full bg-black" />
            </div>

            <div className="px-4 md:px-0">
              <h1 ref={heading} tabIndex={-1} className="mt-4 text-title-1 outline-none">{post.title || "Untitled"}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
                <time title={fullTime(post.createdAt)}>{shortTime(post.createdAt)}</time>
                {post.duration > 0 && <span>· {spokenDuration(post.duration)}</span>}
                {post.aiGenerated && <Badge icon={WandSparkles}>Made with AI</Badge>}
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
                  activeClass="text-fuchsia-400" onClick={() => act("liked", liked, () => toggleLike(post, liked), "like")} />
                <IconButton icon={MessageCircle} label="Comments" count={counts.comment} countNoun="comment" onClick={() => setSheet("comments")} />
                <IconButton icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} pressed={reposted} count={counts.repost} countNoun="repost"
                  activeClass="text-success-text" aria-disabled={mine || post.visibility === "followers" || undefined}
                  className={mine || post.visibility === "followers" ? "opacity-45" : ""}
                  onClick={() => mine || post.visibility === "followers"
                    ? toast({ tone: "info", title: mine ? "You can't repost your own video" : "Followers-only posts can't be reposted" })
                    : act("reposted", reposted, () => toggleRepost(post, reposted), "repost")} />
                <IconButton icon={Send} label="Share" onClick={() => setSheet("share")} />
                <IconButton icon={Bookmark} label={saved ? "Remove from saved" : "Save"} pressed={saved} activeClass="text-accent-text"
                  onClick={() => act("saved", saved, () => toggleSave(post, saved))} />
              </div>

              {post.text && (
                <div className="mt-4 rounded-card bg-surface p-4">
                  <RichText text={post.text} className="text-callout text-fg" />
                </div>
              )}
            </div>
          </div>

          <aside aria-labelledby="more-long" className="px-4 md:px-0">
            <h2 id="more-long" className="mb-3 text-title-3">More long Flicks</h2>
            {more === null && <div className="flex justify-center py-6 text-fg-muted"><Spinner /></div>}
            {more?.length === 0 && <p className="text-callout text-fg-muted">Nothing else yet.</p>}
            <ul className="space-y-3">
              {more?.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => openWatch(v.id)} className="press group flex w-full gap-3 rounded-control text-left">
                    <span className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-control bg-surface-2">
                      <video src={`${v.mediaUrl}#t=${v.trailerStart || 1}`} preload="metadata" muted playsInline tabIndex={-1}
                        aria-hidden="true" className="h-full w-full object-cover" />
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
