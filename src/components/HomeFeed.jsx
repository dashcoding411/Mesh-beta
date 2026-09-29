import { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Sparkles, Users, Search as SearchIcon, CheckCheck } from "lucide-react";
import {
  fetchFeed, fetchAffinity, fetchHiddenPostIds, fetchRepostsBy, fetchPost, fetchTopicPosts, me, tsMillis,
} from "../lib/db";
import { interestById } from "../lib/interests";
import { InterestChips } from "./Interests";
import { rankFeed, screenForViewer } from "../lib/algorithm";
import { navigate } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import FeedTabs from "./shell/FeedTabs";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Skeleton, Loading, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import PostCard from "./PostCard";
import StoryRail from "./StoryRail";
import QuickPost from "./QuickPost";

const PAGE = 12;

// Each feed as you left it: the posts, how far you'd paged and scrolled.
// Going to Messages and back shouldn't reshuffle the feed or lose your
// place. Kept for this visit only, and dropped after a while or when you
// post, so coming back later still brings new things.
const kept = new Map(); // `${uid}:${mode}:${topic}` -> { posts, shown, top, at, feedKey }
const KEEP_MS = 15 * 60 * 1000;
let lastTopic = "all";

/* Home. Two feeds, one switch:

   For you:   Flicks, Stills and Strands ranked together (lib/algorithm.js),
               with reposts from people you follow counted as vouches.
   Following: only people you follow, newest first, no ranking at all. The
               honest alternative for anyone who doesn't want an algorithm. */
export default function HomeFeed({ mode }) {
  const { following, hiddenAuthors, interests, openInterests, hiddenWords, feedKey } = useShell();
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

  // Your own like, save or repost also moves the count kept with the feed,
  // so a card rebuilt from it later shows the number you saw.
  const setViewer = useCallback((id, field, on) => {
    setViewerState(id, field, on);
    const count = { liked: "likeCount", saved: "saveCount", reposted: "repostCount" }[field];
    setPosts((prev) => prev?.map((p) => p.id === id ? { ...p, [count]: Math.max(0, (p[count] || 0) + (on ? 1 : -1)) } : p));
  }, [setViewerState]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    setError(false);
    if (quiet) setRefreshing(true);
    try {
      const [list, affinity, hidden, reposts] = await Promise.all([
        // A topic chip narrows the pool to posts tagged with it.
        topic !== "all" && mode === "foryou" ? fetchTopicPosts(topic) : fetchFeed(),
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

      const visible = [...byId.values()].filter((p) => !hidden.has(p.id) && !p.groupId && !hiddenAuthors.has(p.authorId));

      if (mode === "following") {
        const mine = screenForViewer(visible, { myUid: me(), hiddenWords })
          .filter((p) => following.has(p.authorId) || p.repostedBy?.length);
        // Newest activity first: a repost moves a post up to when it was reposted.
        const when = (p) => Math.max(tsMillis(p.createdAt), ...(p.repostedBy || []).map((r) => r.at));
        setPosts(mine.sort((a, b) => when(b) - when(a)));
      } else {
        setPosts(rankFeed(visible, { followingSet: following, affinity, myUid: me(), interests, hiddenWords }));
      }
      loadedAt.current = Date.now();
    } catch (err) {
      console.error(err);
      if (quiet) toast({ tone: "error", title: "Couldn't refresh", body: "Check your connection and try again." });
      else setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [mode, following, hiddenAuthors, topic, interests, hiddenWords, toast]);

  // Load when the feed or topic changes, not on every follow: following
  // someone mid-scroll shouldn't reshuffle the posts under your thumb. It
  // counts from the next refresh.
  useEffect(() => {
    if (loadedFor.current === keepKey) return;
    loadedFor.current = keepKey;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepKey]);

  // Keep what's on screen, and where you are in it.
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
    // Once more after the stories row and images have had a frame to size.
    const id = requestAnimationFrame(() => { if (feedScroll.current) feedScroll.current.scrollTop = restored.top; });
    return () => cancelAnimationFrame(id);
  }, [restored]);

  // Tapping Home (or For you in the sidebar) while you're at the top.
  useEffect(() => {
    const onRefresh = () => { setShown(PAGE); load({ quiet: true }); };
    window.addEventListener("mesh:refresh", onRefresh);
    return () => window.removeEventListener("mesh:refresh", onRefresh);
  }, [load]);

  const remove = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));
  // Someone you block or mute disappears at once, without waiting for a reload.
  const visiblePosts = posts?.filter((p) => !hiddenAuthors.has(p.authorId)) ?? null;
  const page = visiblePosts?.slice(0, shown) ?? null;
  const more = visiblePosts ? visiblePosts.length - shown : 0;

  return (
    <>
      <HomeHeader section={mode}>
        <FeedTabs value={mode} />
        {mode === "foryou" && (
          <InterestChips interests={interests} value={topic} onEdit={openInterests}
            onChange={setTopic} />
        )}
      </HomeHeader>

      <div ref={feedScroll} data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] md:border-x md:border-line md:min-h-full">
          {refreshing && (
            <p role="status" className="flex items-center justify-center gap-2 border-b border-line py-2.5 text-caption text-fg-subtle anim-fade">
              <Spinner size={14} /> Checking for new posts
            </p>
          )}
          {mode === "foryou" && topic === "all" && (
            <>
              <StoryRail />
              <QuickPost onPosted={(p) => setPosts((prev) => [p, ...(prev || [])])} />
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
            <EmptyState icon={Sparkles} title="Your feed is empty"
              body="Be the first to share something, or find people to follow."
              action={<Button variant="primary" icon={SearchIcon} onClick={() => navigate("/search")}>Find people</Button>} />
          ))}

          {page?.length > 0 && (
            <div className="stagger">
              {page.map((p) => (
                <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={setViewer} onRemoved={remove}
                  onChanged={(id, changes) => setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...changes } : x)))} />
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
                  <p className="mt-1 text-caption text-fg-subtle">That's everything new. Check back later, or follow more people to see more here.</p>
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
