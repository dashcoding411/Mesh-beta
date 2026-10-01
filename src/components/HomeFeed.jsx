import { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Sparkles, Users, Search as SearchIcon, CheckCheck } from "lucide-react";
import {
  fetchFeed, fetchFollowersPosts, fetchHiddenPostIds, fetchRepostsBy, fetchPost, fetchTopicPosts, me, tsMillis,
} from "../lib/db";
import { interestById } from "../lib/interests";
import { latestFirst } from "../lib/algorithm";
import { navigate } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { useShell } from "./shell/ShellContext";
import { useBrick } from "../lib/useBrick";
import HomeHeader from "./shell/HomeHeader";
import FeedTabs from "./shell/FeedTabs";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Skeleton, Loading, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import PostCard, { POST_LIST } from "./PostCard";
import StoryRail from "./StoryRail";
import { PhotoNudge } from "./ProfilePhoto";

const PAGE = 12;

// Feed state kept across remounts (session only; expires, and resets on post).
const kept = new Map(); // `${uid}:${mode}:${topic}` -> { posts, shown, top, at, feedKey }
const KEEP_MS = 15 * 60 * 1000;
let lastTopic = "all";

// For you: everyone's public posts plus followers-only posts from people you
// follow. Following: only people you follow. Both newest first.
export default function HomeFeed({ mode }) {
  const { following, hiddenAuthors, interests, openInterests, hiddenWords, feedKey, guest } = useShell();
  const toast = useToast();
  const [chosen, setChosen] = useState(lastTopic);
  const topic = mode === "foryou" ? chosen : "all"; // topics narrow For you only
  const keepKey = `${me()}:${mode}:${topic}`;
  const [restored] = useState(() => {
    const k = kept.get(keepKey);
    return k && k.feedKey === feedKey && Date.now() - k.at < KEEP_MS ? k : null;
  });
  const feedScroll = useRef(null);
  const scrollTop = useRef(restored?.top || 0);
  const loadedAt = useRef(restored?.at || 0);
  const loadedFor = useRef(restored ? keepKey : null);
  const [posts, setPosts] = useState(restored?.posts ?? null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shown, setShown] = useState(restored?.shown ?? PAGE);
  const [viewer, setViewerState] = usePostStates(posts?.slice(0, shown), keepKey);

  const setTopic = (t) => {
    lastTopic = t;
    setChosen(t);
    setPosts(null);
    setShown(PAGE);
    scrollTop.current = 0;
    feedScroll.current?.scrollTo({ top: 0 });
  };

  // Mirror the viewer's own interactions into the kept counts.
  const setViewer = useCallback((id, field, on) => {
    setViewerState(id, field, on);
    const count = { liked: "likeCount", saved: "saveCount", reposted: "repostCount" }[field];
    setPosts((prev) => prev?.map((p) => p.id === id ? { ...p, [count]: Math.max(0, (p[count] || 0) + (on ? 1 : -1)) } : p));
  }, [setViewerState]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    setError(false);
    if (quiet) setRefreshing(true);
    try {
      const [list, followersOnly, hidden, reposts] = await Promise.all([
        topic !== "all" && mode === "foryou" ? fetchTopicPosts(topic) : fetchFeed(),
        following.size ? fetchFollowersPosts(following) : [],
        fetchHiddenPostIds().catch(() => new Set()),
        following.size ? fetchRepostsBy(following).catch(() => []) : [],
      ]);
      const pool = [...list, ...followersOnly.filter((p) => topic === "all" || p.topics?.includes(topic))];

      // Annotate reposted posts and fetch any that aren't in the pool.
      const byId = new Map(pool.map((p) => [p.id, { ...p }]));
      const missing = [...new Set(reposts.map((r) => r.postId))].filter((id) => !byId.has(id)).slice(0, 20);
      const extra = await Promise.all(missing.map((id) => fetchPost(id).catch(() => null)));
      extra.filter(Boolean).forEach((p) => byId.set(p.id, { ...p }));
      for (const r of reposts) {
        const p = byId.get(r.postId);
        if (!p || r.uid === me()) continue;
        p.repostedBy = [...(p.repostedBy || []), { uid: r.uid, username: r.username, at: tsMillis(r.createdAt) }];
      }

      const visible = [...byId.values()].filter((p) => !hidden.has(p.id) && !p.groupId && !hiddenAuthors.has(p.authorId));

      const ordered = latestFirst(visible, { followingSet: following, myUid: me(), hiddenWords });
      setPosts(mode === "following" ? ordered.filter((p) => following.has(p.authorId) || p.repostedBy?.length) : ordered);
      loadedAt.current = Date.now();
    } catch (err) {
      console.error(err);
      if (quiet) toast({ tone: "error", title: "Couldn't refresh", body: "Check your connection and try again." });
      else setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [mode, following, hiddenAuthors, topic, hiddenWords, toast]);

  // Deliberately not reloaded on follow changes, to avoid reshuffling mid-scroll.
  useEffect(() => {
    if (loadedFor.current === keepKey) return;
    loadedFor.current = keepKey;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepKey]);

  useEffect(() => {
    if (posts) kept.set(keepKey, { posts, shown, top: scrollTop.current, at: loadedAt.current, feedKey });
  }, [keepKey, posts, shown, feedKey]);
  useEffect(() => {
    const el = feedScroll.current;
    if (!el) return;
    const onScroll = () => {
      scrollTop.current = el.scrollTop;
      const k = kept.get(keepKey);
      if (k) k.top = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [keepKey]);
  useLayoutEffect(() => {
    if (!restored?.top || !feedScroll.current) return;
    feedScroll.current.scrollTop = restored.top;
    // Re-apply after layout settles.
    const id = requestAnimationFrame(() => { if (feedScroll.current) feedScroll.current.scrollTop = restored.top; });
    return () => cancelAnimationFrame(id);
  }, [restored]);

  useEffect(() => {
    const onRefresh = () => { setShown(PAGE); load({ quiet: true }); };
    window.addEventListener("mesh:refresh", onRefresh);
    return () => window.removeEventListener("mesh:refresh", onRefresh);
  }, [load]);

  const remove = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));
  // Apply blocks/mutes immediately; drop Flicks once the Flicks cap is reached.
  const flicksLocked = !!useBrick().state("flicks");
  const visiblePosts = posts?.filter((p) => !hiddenAuthors.has(p.authorId)
    && !(flicksLocked && (p.kind === "short" || p.kind === "video"))) ?? null;
  const page = visiblePosts?.slice(0, shown) ?? null;
  const more = visiblePosts ? visiblePosts.length - shown : 0;

  return (
    <>
      <HomeHeader section={mode}>
        <div className="mx-auto w-full max-w-[520px]">
          <FeedTabs mode={mode} topic={topic} interests={interests} onTopic={setTopic}
            onEdit={guest ? undefined : openInterests} guest={guest} />
        </div>
      </HomeHeader>

      <div ref={feedScroll} data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[520px] pb-4">
          {refreshing && (
            <p role="status" className="flex items-center justify-center gap-2 border-b border-line py-2.5 text-caption text-fg-subtle anim-fade">
              <Spinner size={14} /> Checking for new posts
            </p>
          )}
          {mode === "foryou" && topic === "all" && !guest && (
            <>
              <StoryRail />
              <PhotoNudge dismissible className="mx-4 mt-3" />
            </>
          )}

          {error && <ErrorState title="Couldn't load your feed" onRetry={load} />}

          {!error && page === null && <FeedSkeleton />}

          {!error && page?.length === 0 && topic !== "all" && mode === "foryou" && (
            <EmptyState icon={Sparkles} title={`Nothing about ${interestById(topic)?.label || "this"} yet`}
              body="Posts show here when people tag them with this interest. Tag yours when you post."
              action={<Button onClick={() => setTopic("all")}>Show everything</Button>} />
          )}

          {!error && page?.length === 0 && topic === "all" && (mode === "following" ? (
            <EmptyState icon={Users}
              title={following.size ? "Nothing new from people you follow" : "You're not following anyone yet"}
              body={following.size
                ? "When they post or repost, it shows up here: newest first, no algorithm."
                : "Follow people and their posts land here in the order they're shared."}
              action={<Button variant="primary" icon={SearchIcon} onClick={() => navigate("/search")}>Find people</Button>} />
          ) : (
            <EmptyState icon={Sparkles} title={guest ? "Nothing here yet" : "Your feed is empty"}
              body={guest ? "Public posts show up here." : "Be the first to share something, or find people to follow."}
              action={!guest && <Button variant="primary" icon={SearchIcon} onClick={() => navigate("/search")}>Find people</Button>} />
          ))}

          {page?.length > 0 && (
            <div className={`stagger ${POST_LIST}`}>
              {page.map((p) => (
                <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={setViewer} onRemoved={remove}
                  onChanged={(id, changes) => setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...changes } : x)))} />
              ))}
            </div>
          )}

          {/* Intentional end of feed: no infinite scroll. */}
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
                  <p className="mt-1 text-caption text-fg-subtle">
                    {guest ? "That's everything new. Check back later." : "That's everything new. Check back later, or follow more people to see more here."}
                  </p>
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
      <div className={POST_LIST}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="py-3.5 md:rounded-card md:border md:border-line md:bg-surface">
            <div className="flex items-center gap-3 px-4">
              <Skeleton className="h-[38px] w-[38px] shrink-0 !rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            {i === 1
              ? <Skeleton className="mx-4 mt-3 h-24 !rounded-card" />
              : <Skeleton className="mt-3 aspect-[4/5] w-full !rounded-none" />}
            <div className="mt-3 space-y-2 px-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}
