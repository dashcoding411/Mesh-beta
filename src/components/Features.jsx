import { useEffect, useState } from "react";
import { fetchPostsByKind, fetchMyLikes, timeAgo } from "../lib/db";
import PostCard from "./PostCard";

export default function Features({ following }) {
  const [videos, setVideos] = useState(null);
  const [liked, setLiked] = useState(new Set());
  const [active, setActive] = useState(null); // post being watched

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPostsByKind("video");
        if (cancelled) return;
        setVideos(list);
        const likes = await fetchMyLikes(list.map((p) => p.id));
        if (!cancelled) setLiked(likes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setVideos([]);
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

  if (active) {
    return (
      <div className="h-full overflow-y-auto pb-20 md:pb-6">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button onClick={() => setActive(null)} className="text-sm text-zinc-400 hover:text-zinc-200 mb-4">
            ← Back to videos
          </button>
          <PostCard
            post={active}
            liked={liked.has(active.id)}
            onLikedChange={onLikedChange}
            onDeleted={(id) => {
              setVideos((prev) => prev.filter((x) => x.id !== id));
              setActive(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-20 md:pb-6">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold mb-4">Watch</h2>
        {videos === null && <p className="text-zinc-500">Loading videos…</p>}
        {videos?.length === 0 && (
          <div className="text-center text-zinc-500 mt-16">
            <p className="text-lg font-semibold text-zinc-300">No long-form videos yet</p>
            <p className="text-sm mt-1">Hit + Create → Video to upload the first one.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos?.map((v) => (
            <button key={v.id} onClick={() => setActive(v)} className="text-left group">
              {/* Grid cards never instantiate a player: metadata only, so a
                  page of twenty videos doesn't hold twenty decoders open. */}
              <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 relative">
                <video src={v.mediaUrl} preload="none" muted playsInline
                  className="w-full h-full object-cover group-hover:scale-105 transition" />
                <span className="absolute inset-0 flex items-center justify-center text-3xl text-white/80 pointer-events-none">▶</span>
              </div>
              <p className="mt-2 font-semibold text-sm line-clamp-2">{v.title || "Untitled"}</p>
              <p className="text-xs text-zinc-500">
                @{v.authorName} · {v.likeCount || 0} likes · {timeAgo(v.createdAt)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
