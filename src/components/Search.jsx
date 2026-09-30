import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search as SearchIcon, X, History, Clapperboard, Newspaper, Blend, CalendarDays,
  UserPlus, UserCheck, ShieldCheck, ArrowRight, SearchX, Play, Type, Lock,
} from "lucide-react";
import { search, recentSearches, rememberSearch, forgetSearch, clearRecentSearches, loadPool } from "../lib/search";
import { toggleFollow, openUserProfile, openPost, openWatch, me } from "../lib/db";
import { suggestedAccounts } from "../lib/suggest";
import { rankFeed } from "../lib/algorithm";
import { navigate } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { shortTime, plural } from "../lib/format";
import { mediaAlt } from "../lib/a11y";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import Tabs from "./ui/Tabs";
import Avatar from "./ui/Avatar";
import MediaImg from "./ui/MediaImg";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import IconButton from "./ui/IconButton";
import { Highlight } from "./ui/RichText";
import { ErrorState, Skeleton, Spinner, Loading } from "./ui/States";
import { useToast } from "./ui/toast-context";
import PostCard, { POST_LIST } from "./PostCard";

const FILTERS = [
  { id: "top", label: "Top" },
  { id: "people", label: "People" },
  { id: "strands", label: "Strands" },
  { id: "flicks", label: "Flicks" },
  { id: "stills", label: "Stills" },
  { id: "news", label: "News" },
  { id: "circles", label: "Circles" },
  { id: "gatherings", label: "Gatherings" },
];

// Empty state: recent searches, suggestions and an explore mosaic. With a
// query: sectioned results from lib/search.js. The query is kept in the URL.
export default function Search({ initialQuery, filter }) {
  const { following, blocked, muted, hiddenWords, guest } = useShell();
  const [term, setTerm] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [recent, setRecent] = useState(recentSearches);
  const inputRef = useRef(null);
  const runId = useRef(0);
  const q = term.trim();

  // Adopt external query changes (e.g. a tapped #tag); our own URL writes match `q`.
  const [seenInitial, setSeenInitial] = useState(initialQuery);
  if (initialQuery !== seenInitial) {
    setSeenInitial(initialQuery);
    if (initialQuery !== q) setTerm(initialQuery);
  }

  const run = useCallback(async (value) => {
    const id = ++runId.current;
    setStatus("loading");
    try {
      const r = await search(value, { following, me: me(), blocked, muted, hiddenWords });
      if (id !== runId.current) return; // stale
      setResults(r);
      setStatus("done");
    } catch (err) {
      console.error(err);
      if (id === runId.current) setStatus("error");
    }
  }, [following, blocked, muted, hiddenWords]);

  // 300ms debounce; URL kept in sync.
  useEffect(() => {
    // Results aren't rendered under two characters; keep them to avoid a flash.
    if (q.length < 2) return;
    const t = setTimeout(() => {
      run(q);
      const params = new URLSearchParams({ q });
      if (filter !== "top") params.set("type", filter);
      navigate(`/search?${params}`, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, filter, run]);

  const submit = (e) => {
    e.preventDefault();
    if (q.length < 2) return;
    setRecent(rememberSearch(q));
    inputRef.current?.blur();
  };

  const pick = (value) => {
    setTerm(value);
    setRecent(rememberSearch(value));
  };

  const setFilter = (id) => {
    const params = new URLSearchParams(q ? { q } : {});
    if (id !== "top") params.set("type", id);
    navigate(`/search${params.toString() ? `?${params}` : ""}`, { replace: true });
  };

  const sections = results?.sections || [];
  const active = filter === "top" ? null : sections.find((s) => s.id === filter);
  const topId = results?.top?.item.id;
  const topSections = sections
    .map((s) => (topId && s.id === results.top.section ? { ...s, items: s.items.filter((it) => it.id !== topId) } : s))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <HomeHeader section="search">
        <form role="search" onSubmit={submit} className="mx-auto w-full max-w-[680px] px-4 pb-3 md:px-6">
          <label htmlFor="mesh-search" className="sr-only">Search Mesh</label>
          <div className="relative">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <input ref={inputRef} id="mesh-search" type="search" value={term} autoFocus autoComplete="off" enterKeyHint="search"
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search people, Strands, Flicks, news…"
              className="field min-h-12 w-full rounded-full border border-field bg-surface-2 pl-11 pr-12 text-input text-fg placeholder:text-fg-subtle focus:border-accent-text focus:ring-4 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden" />
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
              {status === "loading" && results && <Spinner size={16} className="mr-2 text-fg-subtle" />}
              {term && (
                <IconButton icon={X} label="Clear search" size={18}
                  onClick={() => { setTerm(""); navigate("/search", { replace: true }); inputRef.current?.focus(); }} />
              )}
            </span>
          </div>
        </form>
        {q.length >= 2 && (
          <Tabs variant="underline" label="Filter results" value={filter} onChange={setFilter} className="mx-auto max-w-[680px] px-2 md:px-4"
            tabs={FILTERS.filter((f) => !guest || f.id !== "people").map((f) => ({ ...f, count: f.id === "top" ? 0 : sections.find((s) => s.id === f.id)?.items.length || 0 }))} />
        )}
      </HomeHeader>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] pb-10">
              <p className="sr-only" aria-live="polite">
            {q.length >= 2 && status === "done" && results && (results.total ? `${plural(results.total, "result")} for ${q}` : `No results for ${q}`)}
          </p>

          {q.length < 2 && (
            <Discover recent={recent} onPick={pick}
              onForget={(t) => setRecent(forgetSearch(t))} onClear={() => setRecent(clearRecentSearches())} />
          )}

          {q.length >= 2 && status === "loading" && !results && <ResultSkeleton />}
          {q.length >= 2 && status === "error" && <ErrorState title="Search didn't work" onRetry={() => run(q)} />}

          {q.length >= 2 && results && results.total === 0 && status !== "loading" && <NoResults q={q} />}

          {q.length >= 2 && results && results.total > 0 && (
            filter === "top" ? (
              <>
                {results.top && <TopResult hit={results.top} q={q} />}
                {topSections.map((s) => (
                  <Section key={s.id} section={s} q={q} limit={s.id === "flicks" ? 6 : 3} onSeeAll={() => setFilter(s.id)} />
                ))}
              </>
            ) : active ? (
              <Section section={active} q={q} full />
            ) : (
              <NoResults q={q} scope={FILTERS.find((f) => f.id === filter)?.label} onWiden={() => setFilter("top")} />
            )
          )}
        </div>
      </div>
    </>
  );
}

// Empty state

function Discover({ recent, onPick, onForget, onClear }) {
  const { guest } = useShell();
  return (
    <>
      {recent.length > 0 && (
        <section aria-labelledby="recent-h" className="border-b border-line px-4 py-4 md:px-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-h" className="text-title-3">Recent</h2>
            <Button size="sm" variant="ghost" onClick={onClear}>Clear all</Button>
          </div>
          <ul>
            {recent.map((t) => (
              <li key={t} className="flex items-center">
                <button type="button" onClick={() => onPick(t)}
                  className="press flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-1 text-left hover:bg-surface">
                  <History size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="truncate text-body">{t}</span>
                </button>
                <IconButton icon={X} label={`Remove “${t}” from recent searches`} size={16} onClick={() => onForget(t)} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-fg-subtle">Kept on this device only.</p>
        </section>
      )}
      {!guest && <SuggestedPeople />}
      <Explore />
    </>
  );
}

function SuggestedPeople() {
  const { following, setFollowing } = useShell();
  const [people, setPeople] = useState(null);

  useEffect(() => {
    let cancelled = false;
    suggestedAccounts(following, { max: 10 })
      .then((list) => { if (!cancelled) setPeople(list); })
      .catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
    // Computed once so following from this row doesn't reshuffle it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (people?.length === 0) return null;

  return (
    <section aria-labelledby="people-h" className="border-b border-line py-4">
      <div className="mb-3 px-4 md:px-6">
        <h2 id="people-h" className="text-title-3">People you might like</h2>
        <p className="text-caption text-fg-subtle">Based on who you follow and what you engage with. Never your contacts or location.</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6">
        {people === null && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-44 w-36 !rounded-card" /></li>)}
        {people?.map((p) => (
          <li key={p.id} className="flex w-36 shrink-0 flex-col items-center rounded-card border border-line bg-surface p-3 text-center">
            <button type="button" onClick={() => openUserProfile(p.id)} className="press flex flex-col items-center" aria-label={`${p.name || p.username}'s profile`}>
              <Avatar profile={p} size={56} />
              <span className="mt-2 w-full truncate text-callout font-semibold">{p.name || p.username}</span>
              <span className="w-full truncate text-caption text-fg-subtle">@{p.username}</span>
            </button>
            <span className="mt-1 line-clamp-2 min-h-8 text-label text-fg-subtle">{p.reason}</span>
            <FollowButton person={p} following={following} setFollowing={setFollowing} className="mt-2 w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FollowButton({ person, following, setFollowing, className = "" }) {
  const toast = useToast();
  const { needsAccount } = useShell();
  const [busy, setBusy] = useState(false);
  const on = following.has(person.id);
  if (person.id === me()) return null;
  const toggle = async (e) => {
    e.stopPropagation();
    if (needsAccount("follow people")) return;
    setBusy(true);
    try {
      await toggleFollow(person, on);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.delete(person.id); else next.add(person.id);
        return next;
      });
    } catch {
      toast({ tone: "error", title: "Couldn't update follow" });
    } finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant={on ? "secondary" : "primary"} icon={on ? UserCheck : UserPlus} loading={busy}
      onClick={toggle} className={className} aria-label={`${on ? "Unfollow" : "Follow"} @${person.username}`}>
      {on ? "Following" : "Follow"}
    </Button>
  );
}

// Explore mosaic, ranked with the feed ranker.
function Explore() {
  const { following, hiddenAuthors, hiddenWords } = useShell();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { posts, affinity } = await loadPool();
      const ranked = rankFeed(posts.filter((p) => !p.groupId), { followingSet: following, affinity, myUid: me(), hiddenWords });
      setItems(ranked.filter((p) => p.authorId !== me() && !hiddenAuthors.has(p.authorId)).slice(0, 30));
      setError(false);
    } catch { setError(true); }
  }, [following, hiddenAuthors, hiddenWords]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  return (
    <section aria-labelledby="explore-h" className="py-4">
      <h2 id="explore-h" className="mb-3 px-4 text-title-3 md:px-6">Explore</h2>
      {error && <ErrorState compact title="Couldn't load Explore" onRetry={() => { setError(false); setItems(null); load(); }} />}
      {items === null && !error && (
        <div className="grid grid-cols-3 gap-0.5 px-0.5">
          {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-none" />)}
        </div>
      )}
      {items?.length === 0 && <p className="px-4 text-callout text-fg-muted md:px-6">Nothing to explore yet. Be the first to post.</p>}
      {items?.length > 0 && (
        <ul className="grid grid-flow-dense grid-cols-3 gap-0.5 px-0.5">
          {items.map((p, i) => <Tile key={p.id} post={p} tall={(p.kind === "short" || p.kind === "video") && i % 5 === 1} />)}
        </ul>
      )}
    </section>
  );
}

export function Tile({ post, tall = false }) {
  // Legacy text-only "post" docs render as Strands.
  const asText = post.kind === "text" || (post.kind === "post" && !post.mediaUrl);
  const open = () => {
    if (post.kind === "short") navigate(`/flicks/${post.id}`);
    else if (post.kind === "video") openWatch(post.id);
    else openPost(post.id);
  };
  const label = (post.visibility === "followers" ? "Followers only. " : "") + (
    asText ? `Strand by @${post.authorName}: ${(post.text || "").slice(0, 80)}`
    : post.kind === "post" ? `Still by @${post.authorName}${post.text ? `: ${post.text.slice(0, 60)}` : ""}`
    : `${post.kind === "video" ? "Long Flick" : "Flick"} by @${post.authorName}${post.title ? `: ${post.title}` : ""}`);

  return (
    <li className={tall ? "row-span-2" : ""}>
      <button type="button" onClick={open} aria-label={label}
        className="press group relative block h-full w-full overflow-hidden bg-surface-2 aspect-square data-[tall=true]:aspect-auto"
        data-tall={tall}>
        {post.kind === "post" && post.mediaUrl && (
          <MediaImg src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" className="h-full w-full object-cover transition-transform duration-emphasis group-hover:scale-105" placeholderClass="h-full w-full" />
        )}
        {(post.kind === "short" || post.kind === "video") && (
          <>
            <video src={`${post.mediaUrl}#t=${post.trailerStart || 1}`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true"
              className="h-full w-full object-cover" />
            <span className="absolute right-1.5 top-1.5 text-white drop-shadow" aria-hidden="true">
              {post.kind === "video" ? <Play size={18} fill="currentColor" /> : <Clapperboard size={18} />}
            </span>
          </>
        )}
        {post.visibility === "followers" && (
          <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/60 p-1 text-white" title="Followers only">
            <Lock size={12} aria-hidden="true" />
          </span>
        )}
        {asText && (
          <span className="flex h-full w-full flex-col justify-between border-l-2 border-accent bg-surface-2 p-3 text-left">
            <Type size={16} className="text-accent-text" aria-hidden="true" />
            <span className="line-clamp-4 text-caption font-medium text-fg">{post.text}</span>
            <span className="truncate text-label text-fg-subtle">@{post.authorName}</span>
          </span>
        )}
      </button>
    </li>
  );
}

// Results

function ResultSkeleton() {
  return (
    <Loading label="Searching">
      <div className="space-y-4 px-4 py-4 md:px-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 !rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

function NoResults({ q, scope, onWiden }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
        <SearchX size={26} aria-hidden="true" />
      </span>
      <p className="text-title-3">No {scope ? scope.toLowerCase() : "results"} for “{q}”</p>
      <ul className="mt-3 space-y-1 text-callout text-fg-muted">
        <li>Check the spelling, or try fewer words.</li>
        <li>Looking for someone? Try their @handle.</li>
      </ul>
      {onWiden && <Button className="mt-6" onClick={onWiden}>Search everything instead</Button>}
    </div>
  );
}

function TopResult({ hit, q }) {
  const { following, setFollowing } = useShell();
  const { section, item } = hit;
  return (
    <section aria-label="Top result" className="border-b border-line px-4 py-4 md:px-6">
      <p className="mb-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">Top result</p>
      {section === "people" ? (
        <div className="flex items-center gap-4 rounded-card bg-surface p-4">
          <button type="button" onClick={() => openUserProfile(item.id)} aria-label={`${item.name || item.username}'s profile`}>
            <Avatar profile={item} size={64} />
          </button>
          <button type="button" onClick={() => openUserProfile(item.id)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-title-3"><Highlight text={item.name || item.username} query={q} /></span>
            <span className="block truncate text-callout text-fg-subtle">@<Highlight text={item.username} query={q} /></span>
            <span className="mt-1 block text-caption text-fg-muted">{plural(item.followerCount || 0, "follower")}</span>
          </button>
          <FollowButton person={item} following={following} setFollowing={setFollowing} />
        </div>
      ) : (
        <ResultRow section={section} item={item} q={q} big />
      )}
    </section>
  );
}

function Section({ section, q, limit, full = false, onSeeAll }) {
  const items = full ? section.items : section.items.slice(0, limit);
  const isPosts = ["strands", "stills"].includes(section.id);
  const [viewer, setViewer] = usePostStates(isPosts ? items : null);
  const [removed, setRemoved] = useState(new Set());
  const hasMore = !full && section.items.length > items.length;

  return (
    <section aria-labelledby={`sec-${section.id}`} className="border-b border-line py-3">
      <div className="flex items-center justify-between px-4 pb-1 md:px-6">
        <h2 id={`sec-${section.id}`} className="text-title-3">
          {section.title} <span className="text-callout font-normal text-fg-subtle tabular">{section.items.length}</span>
        </h2>
        {hasMore && (
          <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={onSeeAll}>See all</Button>
        )}
      </div>

      {section.id === "flicks" ? (
        <ul className="grid grid-cols-3 gap-0.5 px-0.5 pt-2">
          {items.map((p) => <Tile key={p.id} post={p} />)}
        </ul>
      ) : isPosts ? (
        <div className={POST_LIST}>
          {items.filter((p) => !removed.has(p.id)).map((p) => (
            <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={setViewer} highlight={q} compact
              onRemoved={(id) => setRemoved((s) => new Set(s).add(id))} />
          ))}
        </div>
      ) : (
        <ul className="px-2 md:px-4">
          {items.map((it) => <li key={it.id}><ResultRow section={section.id} item={it} q={q} /></li>)}
        </ul>
      )}
    </section>
  );
}

function ResultRow({ section, item, q, big = false }) {
  const { following, setFollowing } = useShell();
  const icon = { news: Newspaper, circles: Blend, gatherings: CalendarDays }[section];

  if (section === "people") {
    return (
      <div className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface">
        <button type="button" onClick={() => openUserProfile(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar profile={item} size={44} />
          <span className="min-w-0">
            <span className="block truncate text-callout font-semibold"><Highlight text={item.name || item.username} query={q} /></span>
            <span className="block truncate text-caption text-fg-subtle">
              @<Highlight text={item.username} query={q} />
              {item.bio && <> · <Highlight text={item.bio.slice(0, 80)} query={q} /></>}
            </span>
          </span>
        </button>
        <FollowButton person={item} following={following} setFollowing={setFollowing} />
      </div>
    );
  }

  if (section === "strands" || section === "stills" || section === "flicks") {
    // Top result only; sections render cards.
    return <PostHit post={item} q={q} />;
  }

  const Icon = icon;
  const go = () => {
    if (section === "news") navigate(`/news/${encodeURIComponent(item.id)}`);
    else if (section === "circles") navigate(`/circles/${encodeURIComponent(item.id)}`);
    else navigate("/circles?view=gatherings");
  };
  const title = section === "news" ? item.title : section === "circles" ? item.name : item.title;
  const meta =
    section === "news" ? `@${item.authorName} · ${shortTime(item.createdAt)}`
    : section === "circles" ? `${plural(item.memberCount || 0, "member")}${item.privacy && item.privacy !== "public" ? ` · ${item.privacy}` : ""}`
    : [item.startsAt?.toDate?.().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), item.location].filter(Boolean).join(" · ");
  const body = section === "news" ? item.script : section === "circles" ? item.description : item.description;

  return (
    <button type="button" onClick={go} className={`press flex w-full items-start gap-3 rounded-control px-2 text-left hover:bg-surface ${big ? "bg-surface p-4" : "py-3"}`}>
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-fg-muted">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${big ? "text-title-3" : "text-callout font-semibold"}`}><Highlight text={title} query={q} /></span>
        <span className="mt-0.5 block truncate text-caption text-fg-subtle">{meta}</span>
        {body && <span className="mt-1 line-clamp-2 text-caption text-fg-muted"><Highlight text={body.slice(0, 200)} query={q} /></span>}
        {section === "news" && <Badge tone="success" icon={ShieldCheck} className="mt-2">Reviewed against sources</Badge>}
      </span>
    </button>
  );
}

function PostHit({ post, q }) {
  const [viewer, setViewer] = usePostStates(useMemo(() => [post], [post]));
  return (
    <div className="-mx-4 md:mx-0">
      <PostCard post={post} viewer={viewer} onViewerChange={setViewer} highlight={q} compact />
    </div>
  );
}
