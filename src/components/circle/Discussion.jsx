// A circle's posts, and the box for posting in it.
import {
  ChartBar, Clapperboard, Hourglass, Image, Info, Lock, LockOpen, MessageSquare, Pin, PinOff, Sticker, VolumeX, Search as SearchIcon, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addStrike, circlePostVisibility, createPost, featuredIds, fetchGroupPosts, fetchPendingPosts, isCircleMod, isMuted,
  me, screenPost, setFeaturedPosts, setPostLocked, STRAND_MAX,
} from "../../lib/db";
import { normalise } from "../../lib/search";
import { TopicChips } from "./TopicPicker";
import { suggestTopics } from "../../lib/interests";
import { plural } from "../../lib/format";
import { gifsEnabled } from "../../lib/gifs";
import { checkContent, markPosted } from "../../lib/moderation";
import { usePostStates } from "../../lib/usePostStates";
import { validateText } from "../../lib/validate";
import PostCard from "../PostCard";
import { useShell } from "../shell/ShellContext";
import { postingStatus } from "./status";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Textarea } from "../ui/Field";
import IconButton from "../ui/IconButton";
import { EmptyState, ErrorState, InlineMessage, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

/* Post a Strand straight into the circle. Photo and Flick open the full
   composer. Everything the circle limits is checked before sending, with
   the reason in words; the server checks it all again. */
function CircleQuickPost({ group, membership, onPosted }) {
  const { profile, openComposer } = useShell();
  const toast = useToast();
  const [warned, setWarned] = useState("");
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, STRAND_MAX, "Post");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "post", allowQuoted: true });
    if (mod.error) return setError(mod.error);
    const blocked = screenPost(v.text, group, profile, membership, { kind: "text" });
    if (blocked) return setError(blocked);
    if (mod.note && !warned) return setWarned(mod.note);
    setBusy(true);
    setError("");
    try {
      const post = await createPost({
        kind: "text", text: v.text, groupId: group.id, circleTopic: topic, sensitive: mod.sensitive, topics: suggestTopics(v.text),
        visibility: circlePostVisibility(group, membership, { text: v.text, profile }),
      });
      markPosted("post", v.text);
      setText("");
      onPosted(post);
      toast(post.visibility === "pending"
        ? { tone: "info", title: "Sent to the admins", body: "This circle reviews posts like this one first. It'll appear once someone approves it." }
        : { title: "Posted to the circle" });
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "The circle's limits turned that down. Check the circle's About tab."
        : "Couldn't post. Check your connection. Your words are still here.");
    } finally { setBusy(false); }
  };

  const composerOpts = (kind) => ({ kind, groupId: group.id, group, membership, circleTopic: topic });

  return (
    <form onSubmit={submit} className="group rounded-card border border-line bg-surface p-4" aria-label={`Post in ${group.name}`}>
      <div className="flex gap-3">
        <Avatar profile={profile} size={40} />
        <div className="min-w-0 flex-1">
          <label htmlFor="circle-post" className="sr-only">Write a post</label>
          <Textarea id="circle-post" autoGrow rows={1} maxRows={8} value={text}
            onChange={(e) => { setText(e.target.value); setWarned(""); if (error) setError(""); }}
            placeholder={`Share something with ${group.name}…`} maxLength={STRAND_MAX}
            aria-invalid={error ? "true" : undefined} aria-describedby="circle-post-error"
            className="!border-transparent !bg-transparent !px-0 !py-1.5 hover:!border-transparent focus:!ring-0" />
          <div aria-live="polite" className="mt-1">
            <InlineMessage id="circle-post-error">{error}</InlineMessage>
            {warned && <p className="text-caption text-warning-text">{warned}</p>}
          </div>
          {group.topics?.length > 0 && text.trim() && (
            <div className="mt-2"><TopicChips topics={group.topics} value={topic} onChange={setTopic} label="Topic" /></div>
          )}
          <div className="mt-2 flex items-center gap-1 border-t border-line pt-2 transition-colors group-focus-within:border-accent-text">
            <IconButton icon={Image} label="Post a photo" size={20} className="-ml-2.5 text-accent-text" onClick={() => openComposer(composerOpts("post"))} />
            <IconButton icon={Clapperboard} label="Post a Flick" size={20} className="text-accent-text" onClick={() => openComposer(composerOpts("video"))} />
            <IconButton icon={ChartBar} label="Ask with a poll" size={20} className="text-accent-text" onClick={() => openComposer({ ...composerOpts("text"), attach: "poll", text })} />
            {gifsEnabled && <IconButton icon={Sticker} label="Post a GIF" size={20} className="text-accent-text" onClick={() => openComposer({ ...composerOpts("text"), attach: "gif", text })} />}
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim()}>
              {warned ? "Post anyway" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

export function Discussion({ group, membership, onChanged, onReview, onPosted }) {
  const toast = useToast();
  const member = !!membership;
  const moderator = isCircleMod(membership);
  const status = postingStatus(group, membership);
  const [posts, setPosts] = useState(null);
  const [mine, setMine] = useState([]);
  const [queue, setQueue] = useState(0);
  const [error, setError] = useState(false);
  const [topic, setTopic] = useState("");
  const [term, setTerm] = useState("");
  const [viewer, setViewer] = usePostStates(posts);

  const load = useCallback(async () => {
    try {
      setPosts(await fetchGroupPosts(group, { member }));
      setError(false);
    } catch { setError(true); }
    if (member) fetchPendingPosts(group.id, { mine: true }).then(setMine).catch(() => {});
    if (moderator) fetchPendingPosts(group.id).then((l) => setQueue(l.length)).catch(() => {});
  }, [group, member, moderator]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const featured = featuredIds(group);
  const feature = async (p) => {
    const on = !featured.includes(p.id);
    if (on && featured.length >= 3) return toast({ tone: "info", title: "Three posts are featured already", body: "Unfeature one first." });
    try {
      await setFeaturedPosts(group.id, on ? [...featured, p.id] : featured.filter((id) => id !== p.id));
      onChanged();
      toast({ title: on ? "Featured at the top" : "No longer featured" });
    } catch { toast({ tone: "error", title: "Couldn't change that" }); }
  };

  const lock = async (p) => {
    try {
      await setPostLocked(p.id, !p.locked);
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, locked: !x.locked } : x)));
      toast({ title: p.locked ? "Comments reopened" : "Comments paused" });
    } catch { toast({ tone: "error", title: "Couldn't change comments" }); }
  };

  // A moderator's removal counts against its author for 28 days, which the
  // circle can use to pause their posting (Admin Assist).
  const removed = (id, why) => {
    const post = posts?.find((x) => x.id === id);
    setPosts((prev) => prev.filter((x) => x.id !== id));
    if (why === "deleted" && moderator && post && post.authorId !== me()) {
      addStrike(group.id, post.authorId);
      toast({ title: "Removed from the circle", body: "It counts against the author for 28 days." });
    }
  };

  // Topic chips and search narrow what's shown; nothing is refetched.
  const query = normalise(term).trim();
  const shown = useMemo(() => {
    const words = query.split(/\s+/).filter((w) => w.length >= 2);
    return (posts || []).filter((p) => {
      if (topic && p.circleTopic !== topic) return false;
      if (!words.length) return true;
      const hay = normalise(`${p.title || ""} ${p.text || ""} ${p.authorName || ""}`);
      return words.every((w) => hay.includes(w));
    });
  }, [posts, topic, query]);
  const filtering = !!topic || query.length >= 2;
  const top = filtering ? [] : featured.map((id) => posts?.find((p) => p.id === id)).filter(Boolean);
  const rest = shown.filter((p) => !top.includes(p));

  const row = (p, isFeatured) => (
    <div key={p.id} className="border-b border-line last:border-0">
      {isFeatured && (
        <p className="flex items-center gap-1.5 px-4 pt-3 text-label font-semibold uppercase tracking-wider text-accent-text">
          <Pin size={12} aria-hidden="true" /> Featured
        </p>
      )}
      {p.circleTopic && !isFeatured && (
        <p className="px-4 pt-3 text-label font-semibold text-fg-subtle">{p.circleTopic}</p>
      )}
      <PostCard post={p} viewer={viewer} onViewerChange={setViewer} canModerate={moderator} highlight={term || undefined}
        onRemoved={removed} />
      {moderator && (
        <div className="-mt-2 flex flex-wrap items-center gap-1 px-4 pb-3 pl-[60px]">
          <Button size="sm" variant="ghost" icon={featured.includes(p.id) ? PinOff : Pin} onClick={() => feature(p)}>
            {featured.includes(p.id) ? "Unfeature" : "Feature"}
          </Button>
          <Button size="sm" variant="ghost" icon={p.locked ? LockOpen : Lock} onClick={() => lock(p)}>
            {p.locked ? "Reopen comments" : "Pause comments"}
          </Button>
          {p.locked && <Badge tone="warning">Comments paused</Badge>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {status.ok ? (
        <CircleQuickPost group={group} membership={membership}
          onPosted={(p) => { onPosted?.(); if (p.visibility === "pending") setMine((m) => [p, ...m]); else setPosts((prev) => [p, ...(prev || [])]); }} />
      ) : (
        <p className="flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-callout text-fg-muted">
          {isMuted(membership) ? <VolumeX size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
          {status.reason}
        </p>
      )}

      {moderator && queue > 0 && (
        <button type="button" onClick={onReview}
          className="press flex w-full items-center gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-left">
          <Hourglass size={18} className="shrink-0 text-warning-text" aria-hidden="true" />
          <span className="flex-1 text-callout font-semibold text-warning-text">{plural(queue, "post")} waiting for approval</span>
          <span className="text-caption font-semibold text-fg">Review</span>
        </button>
      )}

      {mine.length > 0 && (
        <section aria-label="Your posts waiting for approval" className="rounded-card border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-callout font-semibold"><Hourglass size={16} aria-hidden="true" /> Waiting for approval</p>
          <ul className="mt-2 space-y-2">
            {mine.map((p) => (
              <li key={p.id} className="line-clamp-2 rounded-control bg-surface-2 px-3 py-2 text-callout text-fg-muted">{p.text || p.title || "Your post"}</li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-fg-subtle">Only you and the circle's admins can see these until one is approved.</p>
        </section>
      )}

      {posts?.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <label htmlFor="circle-search" className="sr-only">Search this circle</label>
            <input id="circle-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${group.name}`}
              className="field min-h-11 w-full rounded-control border border-field bg-surface-2 pl-9 pr-10 text-callout text-fg placeholder:text-fg-subtle focus:border-accent-text focus:ring-4 focus:ring-accent/25" />
            {term && (
              <button type="button" onClick={() => setTerm("")} aria-label="Clear search"
                className="press absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:text-fg">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {group.topics?.length > 0 && <TopicChips topics={group.topics} value={topic} onChange={setTopic} label="Filter by topic" withAll />}
        </div>
      )}

      {error && <ErrorState compact title="Couldn't load the discussion" onRetry={() => { setError(false); setPosts(null); load(); }} />}
      {!error && posts === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>}
      {posts?.length === 0 && (
        <EmptyState compact icon={MessageSquare} title="Nothing posted yet" body={status.ok ? "Start things off." : "Check back soon."} />
      )}
      {posts?.length > 0 && filtering && rest.length === 0 && (
        <EmptyState compact icon={SearchIcon} title="Nothing matches" body="Try other words, or another topic."
          action={<Button onClick={() => { setTerm(""); setTopic(""); }}>Show everything</Button>} />
      )}
      {(top.length > 0 || rest.length > 0) && (
        <div className="overflow-hidden rounded-card border border-line">
          {top.map((p) => row(p, true))}
          {rest.map((p) => row(p, false))}
        </div>
      )}
    </div>
  );
}
