import { Fragment, useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Sparkles, Users, Search as SearchIcon, CheckCheck } from "lucide-react";
import {
  fetchFeed, fetchFollowersPosts, fetchFollowedNews, fetchHiddenPostIds, fetchCirclePosts, publicCircles, fetchLiveAds, adRunning, adFits, fetchRepostsBy, fetchPost, fetchTopicPosts, me, tsMillis,
} from "../lib/db";
import { interestById } from "../lib/interests";
import { latestFirst } from "../lib/algorithm";
import { hitsHiddenWords } from "../lib/moderation";
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
import NewsFeedCard from "./news/NewsFeedCard";
import StoryRail from "./StoryRail";
import CirclesToJoin from "./CirclesToJoin";
import SuggestedPeople from "./SuggestedPeople";
import AdCard from "./AdCard";
import { PhotoNudge } from "./ProfilePhoto";

const PAGE = 12;

// Feed state kept across remounts (session only; expires, and resets on post).
const kept = new Map(); // `${uid}:${mode}:${topic}` -> { posts, shown, top, at, feedKey }
const KEEP_MS = 15 * 60 * 1000;
let lastTopic = "all";

// For you: everyone's public posts (public circles' included) plus
// followers-only posts from people you follow. Following: only people you
// follow. Both newest first, with stories from journalists you follow mixed
// in by when they were published.
const postTime = (p) => (p.kind === "news" ? p.at : Math.max(tsMillis(p.createdAt), ...(p.repostedBy || []).map((r) => r.at)));

export default function HomeFeed({ mode }) {
  const { following, hiddenAuthors, interests, openInterests, hiddenWords, hideAi, feedKey, guest, profile } = useShell();
  // Directly sold ads that fit what this person told Mesh (see lib/data/ads).
  const [ads, setAds] = useState([]);
  useEffect(() => {
    let live = true;
    fetchLiveAds().then((list) => {
      if (live) setAds(list.filter((a) => adRunning(a) && adFits(a, { profile, interests, guest })));
    });
    return () => { live = false; };
  }, [profile, interests, guest]);
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
  const [viewer, setViewerState] = usePostStates(posts?.slice(0, shown).filter((p) => p.kind !== "news"), keepKey);

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
      const circlesP = publicCircles();
      const [list, followersOnly, hidden, reposts, news, circles, circlePosts] = await Promise.all([
        topic !== "all" && mode === "foryou" ? fetchTopicPosts(topic) : fetchFeed(),
        following.size ? fetchFollowersPosts(following) : [],
        fetchHiddenPostIds().catch(() => new Set()),
        following.size ? fetchRepostsBy(following).catch(() => []) : [],
        following.size && topic === "all" ? fetchFollowedNews(following).catch(() => []) : [],
        circlesP,
        circlesP.then((cs) => (cs.length ? fetchCirclePosts(cs.map((c) => c.id)) : [])),
      ]);
      const circleName = new Map(circles.map((c) => [c.id, c.name]));
      const pool = [...list, ...followersOnly, ...circlePosts].filter((p) => topic === "all" || p.topics?.includes(topic));

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

      const visible = [...byId.values()]
        .filter((p) => !hidden.has(p.id) && !hiddenAuthors.has(p.authorId) && (!p.groupId || (p.visibility === "public" && circleName.has(p.groupId))))
        .map((p) => (p.groupId ? { ...p, circleName: circleName.get(p.groupId) } : p));

      const ordered = latestFirst(visible, { followingSet: following, myUid: me(), hiddenWords, hideAi });
      const stories = news
        .filter((s) => !hiddenAuthors.has(s.authorId) && !hitsHiddenWords(`${s.title} ${s.standfirst || ""}`, hiddenWords))
        .map((s) => ({ id: `news:${s.id}`, kind: "news", story: s, authorId: s.authorId, at: tsMillis(s.publishedAt) || tsMillis(s.createdAt) }));
      const feed = mode === "following" ? ordered.filter((p) => following.has(p.authorId) || p.repostedBy?.length) : ordered;
      setPosts([...feed, ...stories].sort((a, b) => postTime(b) - postTime(a)));
      loadedAt.current = Date.now();
    } catch (err) {
      console.error(err);
      if (quiet) toast({ tone: "error", title: "Couldn't refresh", body: "Check your connection and try again." });
      else setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [mode, following, hiddenAuthors, topic, hiddenWords, hideAi, toast]);

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
  // Apply blocks, mutes and the AI setting immediately; drop Flicks once the Flicks cap is reached.
  const brick = useBrick();
  const flicksLocked = !!brick.state("flicks");
  const newsLocked = !!brick.state("news");
  const visiblePosts = posts?.filter((p) => !hiddenAuthors.has(p.authorId)
    && !(hideAi && p.aiGenerated && p.authorId !== me())
    && !(flicksLocked && (p.kind === "short" || p.kind === "video"))
    && !(newsLocked && p.kind === "news")) ?? null;
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
              {page.map((p, i) => (
                <Fragment key={p.id}>
                  {p.kind === "news" ? <NewsFeedCard story={p.story} /> : (
                    <PostCard post={p} viewer={viewer} onViewerChange={setViewer} onRemoved={remove}
                      onChanged={(id, changes) => setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...changes } : x)))} />
                  )}
                  {/* Breaks in the scroll so Home is about places and people, not just a timeline. */}
                  {i === 3 && mode === "foryou" && topic === "all" && <CirclesToJoin />}
                  {/* One ad after the 6th post, then every 10, taking turns. */}
                  {i % 10 === 5 && ads.length > 0 && <AdCard ad={ads[Math.floor(i / 10) % ads.length]} />}
                  {i === 8 && mode === "foryou" && topic === "all" && !guest && (
                    <SuggestedPeople title="People you may know" className="py-4 md:rounded-card md:border md:border-line md:bg-surface" />
                  )}
                </Fragment>
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
