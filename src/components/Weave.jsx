import { useEffect, useState } from "react";
import { fetchFeed, fetchMyLikes, fetchMySaves, fetchAffinity, fetchHiddenPostIds, me } from "../lib/db";
import { rankFeed } from "../lib/algorithm";
import PostCard from "./PostCard";
import StoryRail from "./StoryRail";

const PAGE = 12;

export default function Weave({ following }) {
  const [ranked, setRanked] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [liked, setLiked] = useState(new Set());
  const [saved, setSaved] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, affinity, hidden] = await Promise.all([
          fetchFeed(),
          fetchAffinity().catch(() => new Map()),
          fetchHiddenPostIds().catch(() => new Set()),
        ]);
        if (cancelled) return;
        // Anything explicitly hidden never comes back.
        const visible = list.filter((p) => !hidden.has(p.id));
        const order = rankFeed(visible, { followingSet: following, affinity, myUid: me() });
        setRanked(order);
        const firstPage = order.slice(0, PAGE).map((p) => p.id);
        const [likes, saves] = await Promise.all([
          fetchMyLikes(firstPage),
          fetchMySaves(firstPage).catch(() => new Set()),
        ]);
        if (!cancelled) { setLiked(likes); setSaved(saves); }
      } catch (err) {
        console.error(err);
        if (!cancelled) setRanked([]);
      }
    })();
    return () => { cancelled = true; };
  }, [following]);

  const toggleIn = (setter) => (id, on) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const posts = ranked?.slice(0, shown) ?? null;
  const more = ranked ? ranked.length - shown : 0;

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-xl mx-auto px-4 py-5">
        <StoryRail />

        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mt-6 mb-4">For You</h2>

        {posts === null && <FeedSkeleton />}
        {posts?.length === 0 && (
          <div className="text-center text-zinc-400 mt-16 anim-rise">
            <p className="text-lg font-semibold text-zinc-300">Your fabric is empty</p>
            <p className="text-sm mt-1">Hit Create and share the first story, or find people in Discover.</p>
          </div>
        )}

        <div className="space-y-6 stagger">
          {posts?.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              liked={liked.has(p.id)}
              saved={saved.has(p.id)}
              onLikedChange={toggleIn(setLiked)}
              onSavedChange={toggleIn(setSaved)}
              onDeleted={(id) => setRanked((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>

        {/* A deliberate stopping cue. Infinite scroll works by removing the
            moment where you'd otherwise ask "do I want to keep going?" — this
            hands that moment back and makes continuing a choice. */}
        {posts?.length > 0 && (
          <div className="mt-8 text-center">
            {more > 0 ? (
              <>
                <button onClick={() => setShown((n) => n + PAGE)}
                  className="min-h-[44px] rounded-xl border border-zinc-700 hover:border-violet-500 px-6 text-sm font-medium text-zinc-300 transition">
                  Show {Math.min(more, PAGE)} more
                </button>
                <p className="mt-2 text-xs text-zinc-400">{more} left in this batch</p>
              </>
            ) : (
              <div className="py-6">
                <p className="text-sm font-medium text-zinc-300">You're all caught up</p>
                <p className="text-xs text-zinc-400 mt-1">That's everything new since your last visit.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-zinc-800" />
              <div className="h-2 w-16 rounded bg-zinc-800" />
            </div>
          </div>
          <div className="mt-4 h-3 w-3/4 rounded bg-zinc-800" />
          <div className="mt-2 h-40 rounded-xl bg-zinc-800/60" />
        </div>
      ))}
    </div>
  );
}
