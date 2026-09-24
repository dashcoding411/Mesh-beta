import { useEffect, useRef, useState } from "react";
import { fetchPostsByKind, fetchMyLikes, toggleLike, timeAgo, openUserProfile, recordSignal } from "../lib/db";
import Comments from "./Comments";

function Short({ post, liked, onLikedChange }) {
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [pulse, setPulse] = useState(false);
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const countedView = useRef(false);

  /* Mobile devices expose only a handful of hardware video decoders. Keeping
     off-screen players allocated is a direct cause of jank and OOM kills, so
     leaving the viewport tears the source down rather than just pausing. */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const onScreen = entry.isIntersecting;
        setActive(onScreen);
        if (onScreen) {
          el.play().catch(() => {});
          if (!countedView.current) {
            countedView.current = true;
            recordSignal(post, "view").catch(() => {});
          }
        } else {
          el.pause();
          // Release the decoder and frame buffer.
          el.removeAttribute("src");
          el.load();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [post]);

  // Re-attach the source when the card comes back into view.
  useEffect(() => {
    const el = videoRef.current;
    if (el && active && !el.getAttribute("src")) {
      el.setAttribute("src", post.mediaUrl);
      el.play().catch(() => {});
    }
  }, [active, post.mediaUrl]);

  const handleLike = async () => {
    setPulse(true);
    await toggleLike(post, liked);
    setLikeCount((c) => c + (liked ? -1 : 1));
    onLikedChange(post.id, !liked);
    setTimeout(() => setPulse(false), 400);
  };

  return (
    <div className="h-full w-full snap-start relative flex items-center justify-center bg-black shrink-0">
      <video
        ref={videoRef}
        src={post.mediaUrl}
        className="h-full max-w-full object-contain"
        loop
        muted
        playsInline
        preload="none"
        onEnded={() => recordSignal(post, "complete").catch(() => {})}
        onClick={(e) => (e.target.paused ? e.target.play() : e.target.pause())}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
      <div className="absolute left-4 bottom-20 md:bottom-8 right-20 text-sm">
        <button onClick={() => openUserProfile(post.authorId)} className="font-semibold hover:text-violet-300">
          @{post.authorName} <span className="text-zinc-400 font-normal text-xs">· {timeAgo(post.createdAt)}</span>
        </button>
        {post.text && <p className="text-zinc-200 mt-1 line-clamp-3">{post.text}</p>}
      </div>
      <div className="absolute right-3 bottom-20 md:bottom-8 flex flex-col items-center gap-5">
        <button onClick={handleLike} aria-pressed={liked}
          aria-label={`${liked ? "Unlike" : "Like"} — ${likeCount} like${likeCount === 1 ? "" : "s"}`}
          className="flex flex-col items-center text-sm">
          <span className={`text-2xl ${liked ? "text-fuchsia-400" : ""} ${pulse ? "anim-heart inline-block" : ""}`}>
            {liked ? "♥" : "♡"}
          </span>
          {likeCount}
        </button>
        <button onClick={() => setShowComments(true)}
          aria-label={`Comments — ${commentCount} comment${commentCount === 1 ? "" : "s"}`}
          className="flex flex-col items-center text-sm">
          <span className="text-2xl">💬</span>
          {commentCount}
        </button>
      </div>
      {showComments && (
        <Comments post={post} onClose={() => setShowComments(false)} onCommentAdded={() => setCommentCount((c) => c + 1)} />
      )}
    </div>
  );
}

export default function Flicks({ following }) {
  const [shorts, setShorts] = useState(null);
  const [liked, setLiked] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPostsByKind("short");
        if (cancelled) return;
        setShorts(list);
        const likes = await fetchMyLikes(list.map((p) => p.id));
        if (!cancelled) setLiked(likes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setShorts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [following]);

  const onLikedChange = (id, isLiked) => {
    setLiked((prev) => {
      const next = new Set(prev);
      isLiked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  if (shorts === null) return <p className="text-center text-zinc-400 mt-16">Loading shorts…</p>;
  if (shorts.length === 0)
    return (
      <div className="text-center text-zinc-400 mt-16 anim-rise">
        <p className="text-lg font-semibold text-zinc-300">No shorts yet</p>
        <p className="text-sm mt-1">Hit + Create → Short to post the first one.</p>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar bg-black">
      {shorts.map((p) => (
        <Short key={p.id} post={p} liked={liked.has(p.id)} onLikedChange={onLikedChange} />
      ))}
    </div>
  );
}
