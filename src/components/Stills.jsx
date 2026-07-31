import { useEffect, useState } from "react";
import { fetchPostsByKind, fetchMyLikes } from "../lib/db";
import PostCard from "./PostCard";
import { FeedSkeleton } from "./Weave";

// Instagram-style page: photo/text posts only.
export default function Stills({ following }) {
  const [posts, setPosts] = useState(null);
  const [liked, setLiked] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPostsByKind("post");
        if (cancelled) return;
        setPosts(list);
        const likes = await fetchMyLikes(list.map((p) => p.id));
        if (!cancelled) setLiked(likes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPosts([]);
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

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold mb-5">Posts</h2>
        {posts === null && <FeedSkeleton />}
        {posts?.length === 0 && (
          <div className="text-center text-zinc-500 mt-16">
            <p className="text-lg font-semibold text-zinc-300">No posts yet</p>
            <p className="text-sm mt-1">Hit + Create → Post to share a photo or a thought.</p>
          </div>
        )}
        <div className="space-y-6 stagger">
          {posts?.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              liked={liked.has(p.id)}
              onLikedChange={onLikedChange}
              onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
