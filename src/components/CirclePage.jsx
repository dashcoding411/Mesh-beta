import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Pin, PinOff, Lock, LockOpen, ShieldCheck, Settings2, PenLine, CalendarPlus, Users,
  UserPlus, Clock, Check, X, MessageSquare, CalendarDays, Info, Image, Clapperboard, Hourglass,
  Link2Off, UserCheck, BadgeCheck, Ban, VolumeX,
} from "lucide-react";
import {
  fetchGroupPosts, fetchPendingPosts, approvePost, deletePost, fetchMembership, fetchMembers, joinGroup,
  leaveGroup, setMemberRole, removeMember, ROLES, fetchEvents, fetchMyRsvps, me, fetchGroupById,
  requestToJoin, myJoinRequest, fetchJoinRequests, approveJoinRequest, declineJoinRequest,
  setCircleRules, setScreeningQuestions, setCircleLimits, AUTOMOD_DEFAULTS, AGE_LIMITS,
  setPinnedPost, setPostLocked, penaliseMember, isMuted, isCircleMod, contributorBadge, countPostsByMember,
  createPost, screenPost, circlePostVisibility, canJoinDirectly, meetsAgeLimit, STRAND_MAX,
} from "../lib/db";
import { validateText } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import { goBack, navigate } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { plural, shortTime, clockTime } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Badge from "./ui/Badge";
import Avatar from "./ui/Avatar";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { Field, Input, Textarea, Checkbox } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";
import PostCard from "./PostCard";
import { PrivacyBadge } from "./Circles";
import { GatheringCard, NewGatheringDialog } from "./Events";

const TABS = [
  { id: "discussion", label: "Discussion" },
  { id: "gatherings", label: "Gatherings" },
  { id: "members", label: "Members" },
  { id: "about", label: "About" },
];

/* Why you can or can't post here, in words. Mirrors circlePostOk in the rules. */
function postingStatus(group, membership) {
  const automod = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) };
  if (!membership) return { ok: false, reason: "Join this circle to post in it." };
  if (isMuted(membership)) {
    return { ok: false, reason: `An admin has muted you here until ${clockTime(membership.mutedUntil.toMillis())}.` };
  }
  if (automod.postingPermission === "admins" && !isCircleMod(membership)) {
    return { ok: false, reason: "Only admins and moderators post in this circle. You can still comment and react." };
  }
  return { ok: true };
}

/* The limits a circle has switched on, as short chips anyone can read. */
function activeLimits(group) {
  const a = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) };
  const out = [];
  if (group.ageLimit) out.push({ icon: BadgeCheck, label: `${group.ageLimit}+ only` });
  if (!canJoinDirectly(group)) out.push({ icon: UserCheck, label: "Admins approve new members" });
  if (a.postingPermission === "admins") out.push({ icon: Lock, label: "Only admins post" });
  if (a.requirePostApproval) out.push({ icon: Hourglass, label: "Posts are approved first" });
  if (a.blockLinks) out.push({ icon: Link2Off, label: "No links" });
  if (a.blockNewAccounts) out.push({ icon: Clock, label: "Accounts must be 7+ days old" });
  if ((a.bannedWords || []).length) out.push({ icon: Ban, label: `${plural(a.bannedWords.length, "blocked word")}` });
  return out;
}

export default function CirclePage({ circleId }) {
  const toast = useToast();
  const [group, setGroup] = useState(undefined);
  const [tab, setTab] = useState("discussion");
  const [membership, setMembership] = useState(undefined);
  const [memberCount, setMemberCount] = useState(0);
  const [dialog, setDialog] = useState(null); // manage | join | leave
  const [manageSection, setManageSection] = useState("requests");
  const [pendingRequest, setPendingRequest] = useState(null);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    const g = await fetchGroupById(circleId).catch(() => null);
    setGroup(g);
    if (g) setMemberCount(g.memberCount || 0);
  }, [circleId]);

  useEffect(() => {
    (async () => { await load(); })();
    fetchMembership(circleId).then(setMembership).catch(() => setMembership(null));
    myJoinRequest(circleId).then(setPendingRequest).catch(() => {});
  }, [circleId, load]);

  const { profile } = useShell();

  if (group === undefined) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto" role="status" aria-label="Loading circle">
        <Skeleton className="h-40 !rounded-none" />
        <div className="mx-auto max-w-4xl space-y-3 px-4 pt-4"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-32" /></div>
      </div>
    );
  }
  if (group === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState icon={Users} title="This circle isn't available"
          body="It may have been deleted, or it's hidden and you haven't been invited."
          action={<Button onClick={() => goBack("/circles")}>Back to Circles</Button>} />
      </div>
    );
  }

  const isOwner = group.ownerId === me();
  const moderator = isCircleMod(membership);
  const canRead = group.privacy === "public" || !!membership;
  const direct = canJoinDirectly(group);
  const oldEnough = meetsAgeLimit(group.ageLimit, profile);
  const limits = activeLimits(group);

  const join = async () => {
    if (!oldEnough) {
      return toast({ tone: "info", title: `This circle is for people ${group.ageLimit} and over` });
    }
    if (!direct) return setDialog("join");
    setJoining(true);
    try {
      await joinGroup(group.id);
      setMembership({ role: "member" });
      setMemberCount((c) => c + 1);
      toast({ title: `You joined ${group.name}` });
    } catch {
      toast({ tone: "error", title: "Couldn't join right now" });
    } finally { setJoining(false); }
  };

  const leave = async () => {
    try {
      await leaveGroup(group.id);
      setMembership(null);
      setMemberCount((c) => Math.max(0, c - 1));
      setDialog(null);
      toast({ title: `You left ${group.name}` });
    } catch {
      toast({ tone: "error", title: "Couldn't leave right now" });
    }
  };

  const openManage = (section = "requests") => { setManageSection(section); setDialog("manage"); };

  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
      <div className={`relative h-36 bg-gradient-to-br sm:h-48 ${group.coverColor || "from-violet-600 via-fuchsia-600 to-rose-500"}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/20 to-transparent" />
        <IconButton icon={ArrowLeft} label="Back to Circles" tone="overlay" className="absolute left-2 top-[calc(0.5rem+env(safe-area-inset-top))]"
          onClick={() => goBack("/circles")} />
      </div>

      <div className="relative mx-auto -mt-12 max-w-3xl px-4 pb-16 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-title-1">{group.name}</h1>
              <PrivacyBadge privacy={group.privacy} />
            </div>
            <p className="mt-1 text-callout text-fg-muted">
              {plural(memberCount, "member")}
              {membership && <> · you're {(ROLES[membership.role] || "Member").toLowerCase()}</>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {moderator && <Button icon={Settings2} onClick={() => openManage()}>Manage</Button>}
            {membership !== undefined && !isOwner && (
              membership ? (
                <Button icon={Check} onClick={() => setDialog("leave")} aria-label={`Joined. Leave ${group.name}`}>Joined</Button>
              ) : pendingRequest ? (
                <Badge tone="warning" icon={Clock} className="min-h-11 px-4 text-callout">Request sent</Badge>
              ) : (
                <Button variant="primary" icon={UserPlus} loading={joining} onClick={join}>
                  {direct ? "Join" : "Ask to join"}
                </Button>
              )
            )}
          </div>
        </div>

        {limits.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Limits in this circle">
            {limits.map((l) => <li key={l.label}><Badge icon={l.icon}>{l.label}</Badge></li>)}
          </ul>
        )}

        <Tabs variant="underline" label="Circle sections" value={tab} onChange={setTab} className="mt-5" tabs={TABS} />

        <div role="tabpanel" className="pt-5">
          {tab === "about" ? (
            <About group={group} memberCount={memberCount} limits={limits} />
          ) : !canRead ? (
            <EmptyState icon={Lock} title="This circle is private"
              body={pendingRequest ? "Your request is waiting for an admin." : oldEnough ? "Ask to join to see what's being shared." : `It's for people ${group.ageLimit} and over.`} />
          ) : tab === "discussion" ? (
            <Discussion group={group} membership={membership} onChanged={load} onReview={() => openManage("posts")} />
          ) : tab === "gatherings" ? (
            <CircleGatherings group={group} membership={membership} />
          ) : (
            <Members group={group} isOwner={isOwner} moderator={moderator} onCountChange={setMemberCount} />
          )}
        </div>
      </div>

      {dialog === "manage" && (
        <ManageDialog group={group} isOwner={isOwner} section={manageSection} onSection={setManageSection}
          onClose={() => setDialog(null)} onSaved={load} onCountChange={setMemberCount} />
      )}
      {dialog === "join" && (
        <JoinDialog group={group} onClose={() => setDialog(null)}
          onRequested={(r) => { setPendingRequest(r); setDialog(null); toast({ title: "Request sent", body: "An admin will review it." }); }} />
      )}
      {dialog === "leave" && (
        <ConfirmDialog title={`Leave ${group.name}?`} confirmLabel="Leave circle"
          body={direct ? "You can rejoin any time." : "You'll need to ask to join again."}
          onConfirm={leave} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function About({ group, memberCount, limits }) {
  const [admins, setAdmins] = useState([]);
  useEffect(() => {
    fetchMembers(group.id).then((ms) => setAdmins(ms.filter((m) => m.role === "owner" || m.role === "moderator"))).catch(() => {});
  }, [group.id]);

  return (
    <div className="space-y-4">
      <Panel title="About" icon={Info}>
        <p className="text-callout text-fg">{group.description || "No description yet."}</p>
        <p className="mt-2 text-caption text-fg-subtle">{plural(memberCount, "member")} · started {shortTime(group.createdAt)}</p>
      </Panel>
      <Panel title="Limits" icon={ShieldCheck}>
        {limits.length === 0 ? (
          <p className="text-callout text-fg-muted">Open to everyone. Mesh's own hate-speech and spam filters always apply.</p>
        ) : (
          <ul className="space-y-2">
            {limits.map((l) => (
              <li key={l.label} className="flex items-center gap-2 text-callout"><l.icon size={16} className="text-fg-muted" aria-hidden="true" />{l.label}</li>
            ))}
          </ul>
        )}
      </Panel>
      {group.rules && (
        <Panel title="Rules" icon={ShieldCheck}>
          <ol className="list-inside list-decimal space-y-1.5 text-callout text-fg">
            {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Panel>
      )}
      {admins.length > 0 && (
        <Panel title="Admins and moderators" icon={Users}>
          <ul className="space-y-2">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Avatar profile={{ username: a.username || "?" }} size={28} />
                <span className="truncate text-callout">@{a.username || "member"}</span>
                <span className="ml-auto text-label text-fg-subtle">{ROLES[a.role]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">
        <Icon size={14} aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

/* Post a Strand straight into the circle. Photo and Flick open the full
   composer. Everything the circle limits is checked before sending, with
   the reason in words; the server checks it all again. */
function CircleQuickPost({ group, membership, onPosted }) {
  const { profile, openComposer } = useShell();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, STRAND_MAX, "Post");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "strand" });
    if (mod.error) return setError(mod.error);
    const blocked = screenPost(v.text, group, profile, membership);
    if (blocked) return setError(blocked);
    setBusy(true);
    setError("");
    try {
      const post = await createPost({ kind: "text", text: v.text, groupId: group.id, visibility: circlePostVisibility(group, membership) });
      markPosted("strand", v.text);
      setText("");
      onPosted(post);
      toast(post.visibility === "pending"
        ? { tone: "info", title: "Sent to the admins", body: "It'll appear once someone approves it." }
        : { title: "Posted to the circle" });
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "The circle's limits turned that down. Check the circle's About tab."
        : "Couldn't post. Check your connection. Your words are still here.");
    } finally { setBusy(false); }
  };

  const composerOpts = (kind) => ({ kind, groupId: group.id, group, membership });

  return (
    <form onSubmit={submit} className="group rounded-card border border-line bg-surface p-4" aria-label={`Post in ${group.name}`}>
      <div className="flex gap-3">
        <Avatar profile={profile} size={40} />
        <div className="min-w-0 flex-1">
          <label htmlFor="circle-post" className="sr-only">Write a post</label>
          <Textarea id="circle-post" autoGrow rows={1} maxRows={8} value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(""); }}
            placeholder={`Share something with ${group.name}…`} maxLength={STRAND_MAX}
            aria-invalid={error ? "true" : undefined} aria-describedby="circle-post-error"
            className="!border-transparent !bg-transparent !px-0 !py-1.5 hover:!border-transparent focus:!ring-0" />
          <div aria-live="polite" className="mt-1"><InlineMessage id="circle-post-error">{error}</InlineMessage></div>
          <div className="mt-2 flex items-center gap-1 border-t border-line pt-2 transition-colors group-focus-within:border-accent-text">
            <IconButton icon={Image} label="Post a photo" size={20} className="-ml-2.5 text-accent-text" onClick={() => openComposer(composerOpts("post"))} />
            <IconButton icon={Clapperboard} label="Post a Flick" size={20} className="text-accent-text" onClick={() => openComposer(composerOpts("video"))} />
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim()}>Post</Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Discussion({ group, membership, onChanged, onReview }) {
  const toast = useToast();
  const member = !!membership;
  const moderator = isCircleMod(membership);
  const status = postingStatus(group, membership);
  const [posts, setPosts] = useState(null);
  const [mine, setMine] = useState([]);
  const [queue, setQueue] = useState(0);
  const [error, setError] = useState(false);
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

  const pin = async (p) => {
    const on = group.pinnedPostId !== p.id;
    try {
      await setPinnedPost(group.id, on ? p.id : "");
      onChanged();
      toast({ title: on ? "Pinned to the top" : "Unpinned" });
    } catch { toast({ tone: "error", title: "Couldn't change the pin" }); }
  };

  const lock = async (p) => {
    try {
      await setPostLocked(p.id, !p.locked);
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, locked: !x.locked } : x)));
      toast({ title: p.locked ? "Comments reopened" : "Comments paused" });
    } catch { toast({ tone: "error", title: "Couldn't change comments" }); }
  };

  const pinned = posts?.find((p) => p.id === group.pinnedPostId);
  const ordered = posts ? [...(pinned ? [pinned] : []), ...posts.filter((p) => p.id !== group.pinnedPostId)] : null;

  return (
    <div className="space-y-4">
      {status.ok ? (
        <CircleQuickPost group={group} membership={membership}
          onPosted={(p) => (p.visibility === "pending" ? setMine((m) => [p, ...m]) : setPosts((prev) => [p, ...(prev || [])]))} />
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

      {error && <ErrorState compact title="Couldn't load the discussion" onRetry={() => { setError(false); setPosts(null); load(); }} />}
      {!error && ordered === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>}
      {ordered?.length === 0 && (
        <EmptyState compact icon={MessageSquare} title="Nothing posted yet" body={status.ok ? "Start things off." : "Check back soon."} />
      )}
      {ordered?.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line">
          {ordered.map((p) => (
            <div key={p.id} className="border-b border-line last:border-0">
              {p.id === group.pinnedPostId && (
                <p className="flex items-center gap-1.5 px-4 pt-3 text-label font-semibold uppercase tracking-wider text-accent-text">
                  <Pin size={12} aria-hidden="true" /> Pinned
                </p>
              )}
              <PostCard post={p} viewer={viewer} onViewerChange={setViewer} canModerate={moderator}
                onRemoved={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
              {moderator && (
                <div className="-mt-2 flex flex-wrap items-center gap-1 px-4 pb-3 pl-[60px]">
                  <Button size="sm" variant="ghost" icon={group.pinnedPostId === p.id ? PinOff : Pin} onClick={() => pin(p)}>
                    {group.pinnedPostId === p.id ? "Unpin" : "Pin to top"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={p.locked ? LockOpen : Lock} onClick={() => lock(p)}>
                    {p.locked ? "Reopen comments" : "Pause comments"}
                  </Button>
                  {p.locked && <Badge tone="warning">Comments paused</Badge>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CircleGatherings({ group, membership }) {
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(false);
  const status = postingStatus(group, membership);

  const load = useCallback(async () => {
    try {
      const list = await fetchEvents(group.id, { member: !!membership });
      setEvents(list);
      setError(false);
      setRsvps(await fetchMyRsvps(list.map((e) => e.id)).catch(() => new Map()));
    } catch { setError(true); }
  }, [group.id, membership]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  return (
    <>
      {status.ok ? (
        <button type="button" onClick={() => setCreating(true)}
          className="press mb-5 flex min-h-14 w-full items-center gap-3 rounded-card border border-dashed border-field px-4 text-left text-callout text-fg-subtle hover:border-accent-text hover:text-fg">
          <CalendarPlus size={18} aria-hidden="true" /> Plan a gathering for this circle…
        </button>
      ) : membership && (
        <p className="mb-5 text-callout text-fg-muted">{status.reason}</p>
      )}
      {error && <ErrorState compact title="Couldn't load gatherings" onRetry={() => { setError(false); setEvents(null); load(); }} />}
      {!error && events === null && <Skeleton className="h-36 !rounded-card" />}
      {events?.length === 0 && (
        <EmptyState compact icon={CalendarDays} title="Nothing planned yet"
          body={membership ? "Gatherings made here are visible to members by default." : "Public gatherings from this circle show here."} />
      )}
      <div className="space-y-3">
        {events?.map((ev) => <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null} />)}
      </div>
      {creating && (
        <NewGatheringDialog groupId={group.id} onClose={() => setCreating(false)}
          onCreated={(ev) => { setCreating(false); navigate(`/gatherings/${ev.id}`); }} />
      )}
    </>
  );
}

function Members({ group, isOwner, moderator, onCountChange }) {
  const toast = useToast();
  const [members, setMembers] = useState(null);
  const [counts, setCounts] = useState(new Map());
  const [busy, setBusy] = useState("");
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ms = await fetchMembers(group.id).catch(() => []);
      if (cancelled) return;
      setMembers(ms);
      const c = await countPostsByMember(group, true).catch(() => new Map());
      if (!cancelled) setCounts(c);
    })();
    return () => { cancelled = true; };
  }, [group]);

  const act = async (uid, fn, done) => {
    setBusy(uid);
    try { await fn(); if (done) toast({ title: done }); }
    catch (err) { console.error(err); toast({ tone: "error", title: "That didn't work", body: "Try again in a moment." }); }
    finally { setBusy(""); }
  };

  if (members === null) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 !rounded-card" />)}</div>;

  const badgeTone = { violet: "accent", sky: "accent", amber: "warning", emerald: "success", zinc: "neutral" };

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {members.map((m) => {
          const badge = contributorBadge(m, counts.get(m.id) || 0);
          const muted = isMuted(m);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar profile={{ username: m.username || "?" }} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-callout font-medium">{m.id === me() ? "You" : `@${m.username || "member"}`}</p>
                  {badge && <Badge tone={badgeTone[badge.tone] || "neutral"}>{badge.label}</Badge>}
                  {muted && <Badge tone="warning" icon={VolumeX}>Muted</Badge>}
                </div>
                <p className="text-caption text-fg-subtle">{plural(counts.get(m.id) || 0, "post")} here</p>
              </div>
              {moderator && m.role !== "owner" && m.id !== me() && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {isOwner && (
                    <Button size="sm" loading={busy === m.id}
                      onClick={() => act(m.id, async () => {
                        const role = m.role === "moderator" ? "member" : "moderator";
                        await setMemberRole(group.id, m.id, role);
                        setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
                      }, m.role === "moderator" ? "No longer a moderator" : "Made a moderator")}>
                      {m.role === "moderator" ? "Remove mod" : "Make mod"}
                    </Button>
                  )}
                  <Button size="sm" disabled={busy === m.id}
                    onClick={() => act(m.id, async () => {
                      await penaliseMember(group.id, m.id, muted ? "" : "mute12h");
                      setMembers((prev) => prev.map((x) => (x.id === m.id
                        ? { ...x, mutedUntil: muted ? null : { toMillis: () => Date.now() + 12 * 3600 * 1000 } }
                        : x)));
                    }, muted ? "Unmuted" : "Muted for 12 hours")}>
                    {muted ? "Unmute" : "Mute 12h"}
                  </Button>
                  <Button size="sm" variant="danger-ghost" disabled={busy === m.id} onClick={() => setRemoving(m)}>Remove</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {removing && (
        <ConfirmDialog title={`Remove @${removing.username || "this member"}?`} confirmLabel="Remove from circle"
          body="They'll lose access to members-only posts. They can ask to join again."
          busy={busy === removing.id}
          onClose={() => setRemoving(null)}
          onConfirm={() => act(removing.id, async () => {
            await removeMember(group.id, removing.id);
            setMembers((prev) => prev.filter((x) => x.id !== removing.id));
            onCountChange((c) => Math.max(0, c - 1));
            setRemoving(null);
          }, "Member removed")} />
      )}
    </>
  );
}

function JoinDialog({ group, onClose, onRequested }) {
  const questions = group.screeningQuestions || [];
  const [answers, setAnswers] = useState(questions.map(() => ""));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (group.rules && !agreed) return setError("Agree to the rules to ask to join.");
    if (questions.some((_, i) => !answers[i].trim())) return setError("Answer every question. Admins use them to decide.");
    setBusy(true);
    try {
      await requestToJoin(group.id, questions.map((q, i) => ({ q, a: answers[i].trim() })));
      onRequested({ uid: me(), answers });
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "This circle's limits don't let this account join."
        : "Couldn't send your request. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Ask to join ${group.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-callout text-fg-muted">An admin reviews every request here.</p>
        {group.rules && (
          <div>
            <p className="mb-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">Rules</p>
            <ol className="max-h-44 list-inside list-decimal space-y-1 overflow-y-auto rounded-control bg-surface-2 p-3 text-callout">
              {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            <Checkbox checked={agreed} onChange={setAgreed}>I've read these rules and agree to follow them.</Checkbox>
          </div>
        )}
        {questions.map((q, i) => (
          <Field key={i} label={q}>
            <Input value={answers[i]} maxLength={200}
              onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
          </Field>
        ))}
        <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
        <Button type="submit" variant="primary" full loading={busy}>Send request</Button>
      </form>
    </Dialog>
  );
}

function ManageDialog({ group, isOwner, section, onSection, onClose, onSaved, onCountChange }) {
  return (
    <Dialog title="Manage circle" onClose={onClose} size="lg">
      <Tabs variant="underline" label="Manage" value={section} onChange={onSection} className="-mx-1 mb-5"
        tabs={[
          { id: "requests", label: "Requests" },
          { id: "posts", label: "Posts" },
          { id: "limits", label: "Limits" },
          { id: "rules", label: "Rules" },
        ]} />
      {section === "requests" && <JoinRequests group={group} onCountChange={onCountChange} />}
      {section === "posts" && <PostQueue group={group} />}
      {section === "limits" && <LimitsEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "rules" && <RulesEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
    </Dialog>
  );
}

function JoinRequests({ group, onCountChange }) {
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchJoinRequests(group.id).then(setRequests).catch(() => setRequests([]));
  }, [group.id]);

  const decide = async (r, approve) => {
    setBusy(r.id);
    try {
      if (approve) { await approveJoinRequest(group.id, r); onCountChange((c) => c + 1); }
      else await declineJoinRequest(group.id, r.uid);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: approve ? `@${r.username || "Member"} approved` : "Request declined" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  if (requests === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!requests.length) return <EmptyState compact icon={Users} title="No one's waiting to join" />;

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li key={r.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-callout font-semibold">@{r.username || "someone"}</p>
          <dl className="mt-2 space-y-2">
            {(r.answers || []).map((a, i) => (
              <div key={i}>
                <dt className="text-caption text-fg-subtle">{a.q}</dt>
                <dd className="text-callout">{a.a}</dd>
              </div>
            ))}
          </dl>
          {group.rules && <p className="mt-2 flex items-center gap-1.5 text-caption text-success-text"><Check size={13} aria-hidden="true" /> Agreed to the rules</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
            <Button size="sm" icon={X} disabled={busy === r.id} onClick={() => decide(r, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Posts held for approval. Approving publishes it to the circle; declining
   deletes it. */
function PostQueue({ group }) {
  const toast = useToast();
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchPendingPosts(group.id).then(setPosts).catch(() => setPosts([]));
  }, [group.id]);

  const decide = async (p, approve) => {
    setBusy(p.id);
    try {
      if (approve) await approvePost(p, group); else await deletePost(p);
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      toast({ title: approve ? "Approved and published" : "Declined and removed" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  const approval = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) }.requirePostApproval;

  if (posts === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!posts.length) {
    return (
      <EmptyState compact icon={Hourglass} title="Nothing waiting"
        body={approval ? "New posts from members land here before anyone else sees them." : "Turn on post approval in Limits to review members' posts first."} />
    );
  }
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-caption text-fg-subtle">@{p.authorName} · {shortTime(p.createdAt)}</p>
          {p.title && <p className="mt-1 text-callout font-semibold">{p.title}</p>}
          <p className="mt-1 whitespace-pre-wrap break-words text-callout">{p.text || "(photo or video, no caption)"}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === p.id} onClick={() => decide(p, true)}>Approve</Button>
            <Button size="sm" variant="danger-ghost" icon={X} disabled={busy === p.id} onClick={() => decide(p, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Every switch here is enforced by the server, not just the app. */
function LimitsEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [a, setA] = useState({ ...AUTOMOD_DEFAULTS, ...(group.automod || {}) });
  const [words, setWords] = useState((group.automod?.bannedWords || []).join(", "));
  const [requireApproval, setRequireApproval] = useState(!!group.requireApproval || group.privacy !== "public");
  const [ageLimit, setAgeLimit] = useState(group.ageLimit || 0);
  const [busy, setBusy] = useState(false);
  const locked = !isOwner;
  const set = (k) => (v) => setA((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await setCircleLimits(group.id, {
        requireApproval: group.privacy !== "public" ? true : requireApproval,
        ageLimit,
        automod: { ...a, bannedWords: words.split(",").map((w) => w.trim()).filter(Boolean) },
      });
      onSaved();
      toast({ title: "Limits saved", body: "They apply to everything posted from now on." });
    } catch {
      toast({ tone: "error", title: "Couldn't save the limits" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {locked && <p className="rounded-control bg-surface-2 p-3 text-callout text-fg-muted">Only the circle's admin can change limits.</p>}

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can join</h3>
        {group.privacy !== "public" ? (
          <p className="text-caption text-fg-muted">Private and hidden circles always need an admin to approve new members.</p>
        ) : (
          <Choice locked={locked} name="Who can join" value={requireApproval ? "ask" : "open"} onChange={(v) => setRequireApproval(v === "ask")}
            options={[
              { id: "open", label: "Anyone can join", blurb: "Unless you've set screening questions, which always need approval." },
              { id: "ask", label: "Admins approve new members", blurb: "Requests land in the Requests tab." },
            ]} />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Age limit</h3>
        <Choice locked={locked} name="Age limit" value={ageLimit} onChange={setAgeLimit} options={AGE_LIMITS} />
        <p className="text-caption text-fg-subtle">Applies to new members. Accounts without a birth year can't join age-limited circles.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can post</h3>
        <Choice locked={locked} name="Who can post" value={a.postingPermission} onChange={set("postingPermission")}
          options={[
            { id: "members", label: "All members", blurb: "Anyone in the circle can post and plan gatherings." },
            { id: "admins", label: "Only admins and moderators", blurb: "Members can still comment, react and reply to gatherings." },
          ]} />
      </section>

      <section>
        <h3 className="mb-1 text-callout font-semibold">What gets through</h3>
        <div className={`rounded-card border border-line bg-surface-2 px-3 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <Checkbox checked={!!a.requirePostApproval} onChange={set("requirePostApproval")}
            description="Members' posts wait in Manage → Posts until an admin or moderator approves them.">
            Approve posts before they appear
          </Checkbox>
          <Checkbox checked={!!a.blockLinks} onChange={set("blockLinks")} description="Stops link spam. Admins and moderators can still post links.">
            Block posts with links
          </Checkbox>
          <Checkbox checked={!!a.blockNewAccounts} onChange={set("blockNewAccounts")} description="Accounts under 7 days old can read but not post.">
            Hold back brand-new accounts
          </Checkbox>
        </div>
      </section>

      <Field label="Blocked words" hint="Comma separated, up to 40. Posts containing any of them are turned down, for everyone." count={words.length} max={600}>
        <Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="crypto, referral, giveaway" maxLength={600} disabled={locked} />
      </Field>

      {!locked && <Button variant="primary" full loading={busy} onClick={save}>Save limits</Button>}
    </div>
  );
}

function Choice({ name, value, onChange, options, locked }) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className={`press flex min-h-12 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
          value === o.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
        } ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <input type="radio" name={name} checked={value === o.id} disabled={locked} onChange={() => onChange(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
          <span>
            <span className="block text-callout font-semibold">{o.label}</span>
            {o.blurb && <span className="block text-caption text-fg-muted">{o.blurb}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RulesEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [rules, setRules] = useState(group.rules || "");
  const [questions, setQuestions] = useState(group.screeningQuestions || []);
  const [busy, setBusy] = useState(false);

  if (!isOwner) return <p className="text-callout text-fg-muted">Only the circle's admin can edit rules and questions.</p>;

  const save = async () => {
    setBusy(true);
    try {
      await setCircleRules(group.id, rules.trim());
      await setScreeningQuestions(group.id, questions.filter((q) => q && q.trim()));
      onSaved();
      toast({ title: "Rules saved" });
    } catch { toast({ tone: "error", title: "Couldn't save the rules" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Field label="Rules" hint="One per line. People agree to them when they ask to join." count={rules.length} max={2000}>
        <Textarea autoGrow rows={4} value={rules} maxLength={2000} onChange={(e) => setRules(e.target.value)}
          placeholder={"Be kind\nNo self-promotion\nStay on topic"} />
      </Field>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-callout font-medium">Screening questions <span className="font-normal text-fg-subtle">Up to 3, optional</span></legend>
        {[0, 1, 2].map((i) => (
          <Input key={i} value={questions[i] || ""} maxLength={200} placeholder={`Question ${i + 1}`}
            aria-label={`Screening question ${i + 1}`}
            onChange={(e) => { const next = [...questions]; next[i] = e.target.value; setQuestions(next); }} />
        ))}
        <p className="text-caption text-fg-subtle">Asking anything means every new member needs approval.</p>
      </fieldset>
      <Button variant="primary" full loading={busy} onClick={save}>Save rules</Button>
    </div>
  );
}

