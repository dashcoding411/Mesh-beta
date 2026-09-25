import { useCallback, useEffect, useState } from "react";
import { Sparkles, Users, Search as SearchIcon, CheckCheck } from "lucide-react";
import {
  fetchFeed, fetchAffinity, fetchHiddenPostIds, fetchRepostsBy, fetchPost, me, tsMillis,
} from "../lib/db";
import { rankFeed } from "../lib/algorithm";
import { navigate } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import FeedTabs from "./shell/FeedTabs";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Skeleton, Loading } from "./ui/States";
import PostCard from "./PostCard";
import StoryRail from "./StoryRail";
import QuickPost from "./QuickPost";

const PAGE = 12;

/* Home. Two feeds, one switch:

   For you:   Flicks, Stills and Strands ranked together (lib/algorithm.js),
               with reposts from people you follow counted as vouches.
   Following: only people you follow, newest first, no ranking at all. The
               honest alternative for anyone who doesn't want an algorithm. */
export default function HomeFeed({ mode }) {
  const { following } = useShell();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [viewer, setViewer] = usePostStates(posts?.slice(0, shown));

  const load = useCallback(async () => {
    setError(false);
    try {
      const [list, affinity, hidden, reposts] = await Promise.all([
        fetchFeed(),
        fetchAffinity().catch(() => new Map()),
        fetchHiddenPostIds().catch(() => new Set()),
        following.size ? fetchRepostsBy(following).catch(() => []) : [],
      ]);

      // Attach "reposted by" to posts already in the pool, and pull in any
      // reposted post that isn't, someone you follow vouched for it.
      const byId = new Map(list.map((p) => [p.id, { ...p }]));
      const missing = [...new Set(reposts.map((r) => r.postId))].filter((id) => !byId.has(id)).slice(0, 20);
      const extra = await Promise.all(missing.map((id) => fetchPost(id).catch(() => null)));
      extra.filter(Boolean).forEach((p) => byId.set(p.id, { ...p }));
      for (const r of reposts) {
        const p = byId.get(r.postId);
        if (!p || r.uid === me()) continue;
        p.repostedBy = [...(p.repostedBy || []), { uid: r.uid, username: r.username, at: tsMillis(r.createdAt) }];
      }

      const visible = [...byId.values()].filter((p) => !hidden.has(p.id) && !p.groupId);

      if (mode === "following") {
        const mine = visible.filter((p) => following.has(p.authorId) || p.repostedBy?.length);
        // Newest activity first: a repost moves a post up to when it was reposted.
        const when = (p) => Math.max(tsMillis(p.createdAt), ...(p.repostedBy || []).map((r) => r.at));
        setPosts(mine.sort((a, b) => when(b) - when(a)));
      } else {
        setPosts(rankFeed(visible, { followingSet: following, affinity, myUid: me() }));
      }
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, [mode, following]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const remove = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));
  const page = posts?.slice(0, shown) ?? null;
  const more = posts ? posts.length - shown : 0;

  return (
    <>
      <HomeHeader section={mode}>
        <FeedTabs value={mode} />
      </HomeHeader>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] md:border-x md:border-line md:min-h-full">
          {mode === "foryou" && (
            <>
              <StoryRail />
              <QuickPost onPosted={(p) => setPosts((prev) => [p, ...(prev || [])])} />
            </>
          )}

          {error && <ErrorState title="Couldn't load your feed" onRetry={load} />}

          {!error && page === null && <FeedSkeleton />}

          {!error && page?.length === 0 && (mode === "following" ? (
            <EmptyState icon={Users}
              title={following.size ? "Nothing new from people you follow" : "You're not following anyone yet"}
              body={following.size
                ? "When they post or repost, it shows up here: newest first, no algorithm."
                : "Follow people and their posts land here in the order they're shared."}
              action={<Button variant="primary" icon={SearchIcon} onClick={() => navigate("/search")}>Find people</Button>} />
          ) : (
            <EmptyState icon={Sparkles} title="Your feed is empty"
              body="Be the first to share something, or find people to follow."
              action={<Button variant="primary" icon={SearchIcon} onClick={() => navigate("/search")}>Find people</Button>} />
          ))}

          {page?.length > 0 && (
            <div className="stagger">
              {page.map((p) => (
                <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={setViewer} onRemoved={remove} />
              ))}
            </div>
          )}

          {/* A deliberate stopping point. Infinite scroll removes the moment
              where you'd ask "do I want to keep going?", this hands it back. */}
          {page?.length > 0 && (
            <div className="px-4 py-10 text-center">
              {more > 0 ? (
                <>
                  <Button onClick={() => setShown((n) => n + PAGE)}>
                    Show {Math.min(more, PAGE)} more
                  </Button>
                  <p className="mt-2 text-caption text-fg-subtle">{more} more in this batch</p>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-success-text">
                    <CheckCheck size={22} aria-hidden="true" />
                  </span>
                  <p className="text-callout font-semibold text-fg">You're all caught up</p>
                  <p className="mt-1 text-caption text-fg-subtle">That's everything for now. Go do something good.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <Loading label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-line px-4 py-4">
          <Skeleton className="h-10 w-10 shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-2/3" />
            {i !== 1 && <Skeleton className="mt-3 aspect-[4/3] w-full !rounded-card" />}
          </div>
        </div>
      ))}
    </Loading>
  );
}
