import { useCallback, useEffect, useState } from "react";
import { BrickWall, Clapperboard, EyeOff, Newspaper, Play, Plus, WandSparkles } from "lucide-react";
import {
  fetchVideos, fetchTopicPosts, fetchAffinity, fetchHiddenPostIds, fetchNewsFlicks, openWatch, openUserProfile, me,
} from "../lib/db";
import { rankFeed } from "../lib/algorithm";
import { compact, formatDuration, plural, shortTime, spokenDuration } from "../lib/format";
import { interestById } from "../lib/interests";
import { navigate } from "../lib/router";
import { useBrick } from "../lib/useBrick";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import { InterestChips } from "./Interests";
import MediaImg from "./ui/MediaImg";
import LiveAvatar from "./ui/LiveAvatar";
import VideoFrame from "./post/VideoFrame";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Loading, Skeleton } from "./ui/States";

const isVideo = (p) => p.kind === "short" || p.kind === "video";

// Flicks home: choose what to watch. Short Flicks sit in a row and open the
// vertical player; long ones are a grid that opens the full player. The page
// ends, and shows today's Flicks time against the viewer's limit.
export default function FlicksHome() {
  const { following, hiddenAuthors, interests, openInterests, hiddenWords, hideAi, guest, openComposer } = useShell();
  const [topic, setTopic] = useState("all");
  const [videos, setVideos] = useState(null);
  const [news, setNews] = useState([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [all, affinity, hidden, stories] = await Promise.all([
        topic === "all" ? fetchVideos() : fetchTopicPosts(topic).then((l) => l.filter(isVideo)),
        fetchAffinity().catch(() => new Map()),
        fetchHiddenPostIds().catch(() => new Set()),
        topic === "all" ? fetchNewsFlicks(12).catch(() => []) : Promise.resolve([]),
      ]);
      const pool = all.filter((p) => !hidden.has(p.id) && !hiddenAuthors.has(p.authorId));
      setNews(stories.filter((s) => !hiddenAuthors.has(s.authorId)));
      setVideos(rankFeed(pool, { followingSet: following, affinity, myUid: me(), interests, hiddenWords, hideAi }));
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, [topic, following, hiddenAuthors, interests, hiddenWords, hideAi]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const pick = (t) => { setTopic(t); setVideos(null); };
  const shorts = videos?.filter((p) => p.kind === "short") || [];
  const longs = videos?.filter((p) => p.kind === "video") || [];
  const post = () => openComposer({ kind: "video" });

  return (
    <>
      <HomeHeader section="flicks"
        actions={!guest && <Button size="sm" variant="primary" icon={Plus} className="hidden md:inline-flex" onClick={post}>Post a Flick</Button>}>
        <InterestChips interests={interests} value={topic} onEdit={guest ? undefined : openInterests} onChange={pick} />
      </HomeHeader>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl pb-16 pt-4">
          {!guest && <Allowance />}

          {error && <ErrorState title="Couldn't load Flicks" onRetry={() => { setVideos(null); load(); }} />}
          {!error && videos === null && <HomeSkeleton />}
          {!error && videos?.length === 0 && news.length === 0 && (
            <EmptyState icon={Clapperboard}
              title={topic === "all" ? "No Flicks yet" : `No ${interestById(topic)?.label || ""} Flicks yet`}
              action={topic !== "all"
                ? <Button onClick={() => pick("all")}>Show all Flicks</Button>
                : !guest && <Button variant="brand" icon={Plus} onClick={post}>Post a Flick</Button>} />
          )}

          {!error && videos && news.length > 0 && <NewsShelf stories={news} />}
          {shorts.length > 0 && <ShortShelf posts={shorts} />}
          {longs.length > 0 && <LongGrid posts={longs} />}
          {(videos?.length > 0 || news.length > 0) && (
            <p className="px-4 pt-10 text-center text-caption text-fg-subtle md:px-6">That's every Flick for now.</p>
          )}
        </div>
      </div>
    </>
  );
}

// Today's Flicks time against the viewer's limit. Usage is only metered once a limit is set.
function Allowance() {
  const brick = useBrick();
  const cap = brick.cap("flicks");
  const used = Math.floor((brick.usage?.flicks || 0) / 60);
  return (
    <p className="mx-4 mb-6 flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-caption text-fg-muted md:mx-6">
      <BrickWall size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {cap > 0 ? `${used} of ${plural(cap, "minute")} of Flicks used today.` : "No daily limit on Flicks."}
      </span>
      <button type="button" onClick={() => navigate("/account/brick")}
        className="inline-flex min-h-8 shrink-0 items-center font-semibold text-accent-text hover:underline">
        {cap > 0 ? "Change" : "Set a limit"}
      </button>
    </p>
  );
}

// News Flicks: each opens in the Flicks player, linked to its article.
function NewsShelf({ stories }) {
  return (
    <section aria-labelledby="news-flicks" className="mb-10">
      <h2 id="news-flicks" className="mb-3 flex items-center gap-2 px-4 text-title-3 md:px-6">
        <Newspaper size={18} aria-hidden="true" /> News
      </h2>
      <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6">
        {stories.map((s) => (
          <li key={s.id} className="w-36 shrink-0 md:w-44">
            <button type="button" onClick={() => navigate(`/flicks/news-${s.id}`)} aria-label={`News video: ${s.title}`}
              className="press group relative block aspect-[9/16] w-full overflow-hidden rounded-card bg-surface-2 text-left">
              {s.graphic ? (
                <span className="flex h-full w-full items-center justify-center text-fg-muted"><EyeOff size={24} aria-hidden="true" /></span>
              ) : s.videoPoster ? (
                <MediaImg src={s.videoPoster} alt="" loading="lazy" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
              ) : null}
              <span className="absolute left-2 top-2 rounded-full bg-white px-1.5 py-0.5 text-label font-bold uppercase tracking-wider text-black">News</span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-10">
                <span className="line-clamp-3 text-caption font-semibold text-white">{s.title}</span>
                {s.videoSeconds > 0 && <span className="mt-0.5 block text-label text-white/75 tabular">{formatDuration(s.videoSeconds)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShortShelf({ posts }) {
  return (
    <section aria-labelledby="short-flicks" className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 md:px-6">
        <h2 id="short-flicks" className="text-title-3">Short Flicks</h2>
        <Button size="sm" variant="ghost" icon={Play} onClick={() => navigate(`/flicks/${posts[0].id}`)}>Play all</Button>
      </div>
      <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6">
        {posts.map((p) => (
          <li key={p.id} className="w-36 shrink-0 md:w-44">
            <button type="button" onClick={() => navigate(`/flicks/${p.id}`)}
              aria-label={`Short Flick by @${p.authorName}${p.text ? `: ${p.text.slice(0, 80)}` : ""}`}
              className="press group relative block aspect-[9/16] w-full overflow-hidden rounded-card bg-surface-2 text-left">
              <VideoFrame post={p} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-10">
                {p.text && <span className="line-clamp-2 text-caption font-semibold text-white">{p.text}</span>}
                <span className="mt-0.5 block truncate text-label text-white/75">@{p.authorName}</span>
              </span>
              {p.aiGenerated && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-label font-semibold text-white">
                  <WandSparkles size={11} aria-hidden="true" /> AI
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LongGrid({ posts }) {
  return (
    <section aria-labelledby="long-flicks">
      <h2 id="long-flicks" className="mb-3 px-4 text-title-3 md:px-6">Long Flicks</h2>
      <ul className="grid gap-x-4 gap-y-7 px-4 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        {posts.map((p) => <li key={p.id}><VideoCard post={p} /></li>)}
      </ul>
    </section>
  );
}

function VideoCard({ post }) {
  const title = post.title || "Untitled";
  return (
    <article className="group">
      <button type="button" onClick={() => openWatch(post.id)}
        aria-label={`${title}${post.duration > 0 ? `, ${spokenDuration(post.duration)}` : ""}`}
        className="press relative block aspect-video w-full overflow-hidden rounded-card bg-surface-2">
        <VideoFrame post={post} />
        {post.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 text-label font-semibold text-white tabular">
            {formatDuration(post.duration)}
          </span>
        )}
      </button>
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => openUserProfile(post.authorId)} aria-label={`@${post.authorName}'s profile`} className="h-fit shrink-0">
          <LiveAvatar uid={post.authorId} profile={{ username: post.authorName, name: post.authorDisplayName, photoURL: post.authorPhoto }} size={36} />
        </button>
        <div className="min-w-0">
          <button type="button" onClick={() => openWatch(post.id)} tabIndex={-1}
            className="line-clamp-2 text-left text-callout font-semibold text-fg group-hover:underline">
            {title}
          </button>
          <p className="truncate text-caption text-fg-subtle">{post.authorDisplayName || `@${post.authorName}`}</p>
          <p className="text-caption text-fg-subtle">
            {compact(post.likeCount || 0)} {post.likeCount === 1 ? "like" : "likes"} · {shortTime(post.createdAt)}
          </p>
          {post.aiGenerated && <Badge icon={WandSparkles} className="mt-1">Edited with AI</Badge>}
        </div>
      </div>
    </article>
  );
}

function HomeSkeleton() {
  return (
    <Loading label="Loading Flicks">
      <div className="mb-10 flex gap-3 overflow-hidden px-4 md:px-6">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-[9/16] w-36 shrink-0 !rounded-card md:w-44" />)}
      </div>
      <div className="grid gap-x-4 gap-y-7 px-4 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="aspect-video w-full !rounded-card" />
            <div className="mt-3 flex gap-3">
              <Skeleton className="h-9 w-9 shrink-0 !rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-1/2" /></div>
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}
