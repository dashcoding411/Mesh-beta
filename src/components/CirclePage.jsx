import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Pin, PinOff, Lock, LockOpen, ShieldCheck, Settings2, PenLine, CalendarPlus, Users,
  LogOut, UserPlus, Clock, Check, X, MessageSquare, CalendarDays, Info,
} from "lucide-react";
import {
  fetchGroupPosts, fetchMembership, fetchMembers, joinGroup, leaveGroup,
  setMemberRole, removeMember, canModerate, ROLES, fetchEvents, fetchMyRsvps, me, fetchGroupById,
  requestToJoin, myJoinRequest, fetchJoinRequests, approveJoinRequest, declineJoinRequest,
  setCircleRules, setScreeningQuestions, setAutomod, AUTOMOD_DEFAULTS,
  setPinnedPost, setPostLocked, penaliseMember, isMuted, contributorBadge, countPostsByAuthorInGroup,
} from "../lib/db";
import { goBack } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import { plural, shortTime } from "../lib/format";
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
  { id: "featured", label: "Featured" },
  { id: "discussion", label: "Discussion" },
  { id: "gatherings", label: "Gatherings" },
  { id: "members", label: "Members" },
];

/* A circle's home: identity up top, then tabs for what's pinned, the full
   discussion, what's planned and who's in it. About, rules and admins sit
   beside the content on wide screens and below it on phones. */
export default function CirclePage({ circleId }) {
  const { openComposer } = useShell();
  const toast = useToast();
  const [group, setGroup] = useState(undefined);
  const [tab, setTab] = useState("featured");
  const [membership, setMembership] = useState(undefined);
  const [memberCount, setMemberCount] = useState(0);
  const [dialog, setDialog] = useState(null); // admin | join | leave
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
  const moderator = canModerate(membership, group);
  const muted = isMuted(membership);
  const canPost = !!membership && !muted;
  const canRead = group.privacy === "public" || !!membership;
  const needsScreening = group.privacy !== "public" || group.requireApproval || (group.screeningQuestions || []).length > 0;

  const join = async () => {
    if (needsScreening) return setDialog("join");
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

  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
      <div className={`relative h-36 bg-gradient-to-br sm:h-48 ${group.coverColor || "from-violet-600 via-fuchsia-600 to-rose-500"}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/20 to-transparent" />
        <IconButton icon={ArrowLeft} label="Back to Circles" tone="overlay" className="absolute left-2 top-[calc(0.5rem+env(safe-area-inset-top))]"
          onClick={() => goBack("/circles")} />
      </div>

      <div className="relative mx-auto -mt-12 max-w-5xl px-4 pb-16 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-title-1 font-display">{group.name}</h1>
              <PrivacyBadge privacy={group.privacy} />
            </div>
            <p className="mt-1 text-callout text-fg-muted">
              {plural(memberCount, "member")}
              {membership && <> · you're {(ROLES[membership.role] || "Member").toLowerCase()}</>}
              {muted && <span className="text-warning-text"> · you're muted for now</span>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {moderator && <Button icon={Settings2} onClick={() => setDialog("admin")}>Manage</Button>}
            {membership !== undefined && !isOwner && (
              membership ? (
                <Button icon={Check} onClick={() => setDialog("leave")} aria-label={`Joined. Leave ${group.name}`}>Joined</Button>
              ) : pendingRequest ? (
                <Badge tone="warning" icon={Clock} className="min-h-11 px-4 text-callout">Request pending</Badge>
              ) : (
                <Button variant="primary" icon={UserPlus} loading={joining} onClick={join}>
                  {needsScreening ? "Ask to join" : "Join"}
                </Button>
              )
            )}
            {canPost && (
              <Button variant="brand" icon={PenLine} onClick={() => openComposer({ groupId: group.id, group })}>Post</Button>
            )}
          </div>
        </div>

        <Tabs variant="underline" label="Circle sections" value={tab} onChange={setTab} className="mt-5" tabs={TABS} />

        {!canRead ? (
          <EmptyState icon={Lock} title="This circle is private"
            body={pendingRequest ? "Your request is waiting for an admin." : "Ask to join to see what's being shared."} />
        ) : (
          <div className="mt-5 grid items-start gap-8 lg:grid-cols-[1fr_280px]">
            <div role="tabpanel" className="min-w-0">
              {tab === "featured" && (
                <Featured group={group} moderator={moderator} canPost={canPost}
                  onCompose={() => openComposer({ groupId: group.id, group })} onSeeAll={() => setTab("discussion")} />
              )}
              {tab === "discussion" && <Discussion group={group} moderator={moderator} onChanged={load} />}
              {tab === "gatherings" && <CircleGatherings group={group} canPost={canPost} />}
              {tab === "members" && <Members group={group} isOwner={isOwner} moderator={moderator} onCountChange={setMemberCount} />}
            </div>
            <aside className="space-y-4 lg:sticky lg:top-4" aria-label="About this circle">
              <SidePanel group={group} memberCount={memberCount} />
            </aside>
          </div>
        )}
      </div>

      {dialog === "admin" && (
        <AdminDialog group={group} isOwner={isOwner} onClose={() => setDialog(null)} onSaved={load} onCountChange={setMemberCount} />
      )}
      {dialog === "join" && (
        <JoinDialog group={group} onClose={() => setDialog(null)}
          onRequested={(r) => { setPendingRequest(r); setDialog(null); toast({ title: "Request sent", body: "An admin will review it." }); }}
          onJoined={() => { setMembership({ role: "member" }); setMemberCount((c) => c + 1); setDialog(null); toast({ title: `You joined ${group.name}` }); }} />
      )}
      {dialog === "leave" && (
        <ConfirmDialog title={`Leave ${group.name}?`} confirmLabel="Leave circle"
          body={group.privacy === "public" ? "You can rejoin any time." : "You'll need to ask to join again."}
          onConfirm={leave} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function SidePanel({ group, memberCount }) {
  const [admins, setAdmins] = useState([]);
  useEffect(() => {
    fetchMembers(group.id).then((ms) => setAdmins(ms.filter((m) => m.role === "owner" || m.role === "moderator"))).catch(() => {});
  }, [group.id]);

  return (
    <>
      <Panel title="About" icon={Info}>
        <p className="text-callout text-fg">{group.description || "No description yet."}</p>
        <p className="mt-2 text-caption text-fg-subtle">{plural(memberCount, "member")} · started {shortTime(group.createdAt)}</p>
      </Panel>
      {group.rules && (
        <Panel title="Rules" icon={ShieldCheck}>
          <ol className="list-inside list-decimal space-y-1.5 text-callout text-fg">
            {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Panel>
      )}
      {admins.length > 0 && (
        <Panel title="Admins & moderators" icon={Users}>
          <ul className="space-y-2">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Avatar profile={{ username: a.username || a.id }} size={28} />
                <span className="truncate text-callout">@{a.username || a.id.slice(0, 8)}</span>
                <span className="ml-auto text-label text-fg-subtle">{ROLES[a.role]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
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

function useCirclePosts(groupId) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try { setPosts(await fetchGroupPosts(groupId)); setError(false); }
    catch { setError(true); }
  }, [groupId]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);
  const retry = () => { setError(false); setPosts(null); load(); };
  return { posts, setPosts, error, load: retry };
}

function Featured({ group, moderator, canPost, onCompose, onSeeAll }) {
  const { posts, setPosts, error, load } = useCirclePosts(group.id);
  const pinned = posts?.find((p) => p.id === group.pinnedPostId);
  const rest = (posts || []).filter((p) => p.id !== group.pinnedPostId).slice(0, 3);
  const [viewer, setViewer] = usePostStates(posts ? [pinned, ...rest].filter(Boolean) : null);
  const remove = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="space-y-6">
      {canPost && (
        <button type="button" onClick={onCompose}
          className="press flex min-h-14 w-full items-center gap-3 rounded-card border border-dashed border-field px-4 text-left text-callout text-fg-subtle hover:border-accent-text hover:text-fg">
          <PenLine size={18} aria-hidden="true" /> Share something with the circle…
        </button>
      )}
      {error && <ErrorState compact title="Couldn't load posts" onRetry={load} />}
      {!error && posts === null && <Skeleton className="h-48 !rounded-card" />}
      {pinned && (
        <section aria-label="Pinned">
          <p className="mb-2 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-accent-text">
            <Pin size={13} aria-hidden="true" /> Pinned
          </p>
          <div className="overflow-hidden rounded-card border border-line">
            <PostCard post={pinned} viewer={viewer} onViewerChange={setViewer} canModerate={moderator} onRemoved={remove} />
          </div>
        </section>
      )}
      {posts?.length === 0 && (
        <EmptyState compact icon={MessageSquare} title="Nothing posted yet" body={canPost ? "Start things off." : "Check back soon."} />
      )}
      {rest.length > 0 && (
        <section aria-label="Recent">
          <p className="mb-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">Recent</p>
          <div className="overflow-hidden rounded-card border border-line">
            {rest.map((p) => (
              <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={setViewer} canModerate={moderator} onRemoved={remove} />
            ))}
          </div>
          <Button full className="mt-4" onClick={onSeeAll}>See all discussion</Button>
        </section>
      )}
    </div>
  );
}

function Discussion({ group, moderator, onChanged }) {
  const toast = useToast();
  const { posts, setPosts, error, load } = useCirclePosts(group.id);
  const [viewer, setViewer] = usePostStates(posts);

  const pin = async (p) => {
    const on = group.pinnedPostId !== p.id;
    try {
      await setPinnedPost(group.id, on ? p.id : "");
      onChanged();
      toast({ title: on ? "Pinned to Featured" : "Unpinned" });
    } catch { toast({ tone: "error", title: "Couldn't change the pin" }); }
  };

  const lock = async (p) => {
    try {
      await setPostLocked(p.id, !p.locked);
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, locked: !x.locked } : x)));
      toast({ title: p.locked ? "Comments reopened" : "Comments paused" });
    } catch { toast({ tone: "error", title: "Couldn't change comments" }); }
  };

  if (error) return <ErrorState compact title="Couldn't load the discussion" onRetry={load} />;
  if (posts === null) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>;
  if (!posts.length) return <EmptyState compact icon={MessageSquare} title="No posts yet" />;

  return (
    <div className="overflow-hidden rounded-card border border-line">
      {posts.map((p) => (
        <div key={p.id} className="border-b border-line last:border-0">
          <PostCard post={p} viewer={viewer} onViewerChange={setViewer} canModerate={moderator}
            onRemoved={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          {moderator && (
            <div className="-mt-2 flex flex-wrap items-center gap-1 px-4 pb-3 pl-[60px]">
              <Button size="sm" variant="ghost" icon={group.pinnedPostId === p.id ? PinOff : Pin} onClick={() => pin(p)}>
                {group.pinnedPostId === p.id ? "Unpin" : "Pin to Featured"}
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
  );
}

function CircleGatherings({ group, canPost }) {
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await fetchEvents(group.id);
      setEvents(list);
      setRsvps(await fetchMyRsvps(list.map((e) => e.id)).catch(() => new Map()));
    } catch { setError(true); }
  }, [group.id]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  return (
    <>
      {canPost && (
        <button type="button" onClick={() => setCreating(true)}
          className="press mb-5 flex min-h-14 w-full items-center gap-3 rounded-card border border-dashed border-field px-4 text-left text-callout text-fg-subtle hover:border-accent-text hover:text-fg">
          <CalendarPlus size={18} aria-hidden="true" /> Plan a gathering for this circle…
        </button>
      )}
      {error && <ErrorState compact title="Couldn't load gatherings" onRetry={load} />}
      {!error && events === null && <Skeleton className="h-36 !rounded-card" />}
      {events?.length === 0 && <EmptyState compact icon={CalendarDays} title="Nothing planned yet" />}
      <div className="space-y-3">
        {events?.map((ev) => (
          <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null}
            onStatusChange={(id, status) => setRsvps((prev) => {
              const next = new Map(prev);
              if (status) next.set(id, status); else next.delete(id);
              return next;
            })} />
        ))}
      </div>
      {creating && (
        <NewGatheringDialog groupId={group.id} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
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
      const entries = await Promise.all(
        ms.slice(0, 30).map(async (m) => [m.id, await countPostsByAuthorInGroup(group.id, m.id).catch(() => 0)])
      );
      if (!cancelled) setCounts(new Map(entries));
    })();
    return () => { cancelled = true; };
  }, [group.id]);

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
              <Avatar profile={{ username: m.username || m.id }} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-callout font-medium">@{m.username || m.id.slice(0, 8)}</p>
                  {badge && <Badge tone={badgeTone[badge.tone] || "neutral"}>{badge.label}</Badge>}
                  {muted && <Badge tone="warning">Muted</Badge>}
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

function JoinDialog({ group, onClose, onRequested, onJoined }) {
  const questions = group.screeningQuestions || [];
  const [answers, setAnswers] = useState(questions.map(() => ""));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const screened = group.requireApproval || questions.length > 0 || group.privacy !== "public";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (group.rules && !agreed) return setError("Agree to the rules to join.");
    if (questions.some((_, i) => !answers[i].trim())) return setError("Answer every question. Admins use them to decide.");
    setBusy(true);
    try {
      if (screened) {
        await requestToJoin(group.id, questions.map((q, i) => ({ q, a: answers[i].trim() })));
        onRequested({ uid: me(), answers });
      } else {
        await joinGroup(group.id);
        onJoined();
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't send your request. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Join ${group.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5" noValidate>
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
        <Button type="submit" variant="primary" full loading={busy}>{screened ? "Send request" : "Join circle"}</Button>
      </form>
    </Dialog>
  );
}

function AdminDialog({ group, isOwner, onClose, onSaved, onCountChange }) {
  const [section, setSection] = useState("requests");
  return (
    <Dialog title="Manage circle" onClose={onClose} size="lg">
      <Tabs variant="underline" label="Admin sections" value={section} onChange={setSection} className="-mx-1 mb-5"
        tabs={[{ id: "requests", label: "Requests" }, { id: "rules", label: "Rules" }, { id: "automod", label: "Auto-moderation" }]} />
      {section === "requests" && <JoinRequests group={group} onCountChange={onCountChange} />}
      {section === "rules" && <RulesEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "automod" && <AutomodEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
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
  if (!requests.length) return <EmptyState compact icon={Users} title="No pending requests" />;

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li key={r.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-callout font-semibold">@{r.username || r.uid.slice(0, 8)}</p>
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
      <Field label="Rules" hint="One per line. New members have to agree to them before joining." count={rules.length} max={2000}>
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
        <p className="text-caption text-fg-subtle">Asking anything turns on approval, and requests land in the Requests tab.</p>
      </fieldset>
      <Button variant="primary" full loading={busy} onClick={save}>Save rules</Button>
    </div>
  );
}

function AutomodEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [automod, setLocal] = useState({ ...AUTOMOD_DEFAULTS, ...(group.automod || {}) });
  const [words, setWords] = useState((group.automod?.bannedWords || []).join(", "));
  const [busy, setBusy] = useState(false);

  if (!isOwner) return <p className="text-callout text-fg-muted">Only the circle's admin can change auto-moderation.</p>;

  const save = async () => {
    setBusy(true);
    try {
      await setAutomod(group.id, { ...automod, bannedWords: words.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 40) });
      onSaved();
      toast({ title: "Auto-moderation saved" });
    } catch { toast({ tone: "error", title: "Couldn't save auto-moderation" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-callout text-fg-muted">
        These run before a post is published. Mesh's own hate-speech and spam filters apply on top and can't be switched off.
      </p>
      <div className="rounded-card border border-line bg-surface-2 px-3">
        <Checkbox checked={!!automod.blockLinks} onChange={(v) => setLocal({ ...automod, blockLinks: v })}
          description="Stops link spam; members can still share links in Messages.">
          Block posts with links
        </Checkbox>
        <Checkbox checked={!!automod.blockNewAccounts} onChange={(v) => setLocal({ ...automod, blockNewAccounts: v })}
          description="Accounts under 7 days old can read but not post.">
          Hold back brand-new accounts
        </Checkbox>
      </div>
      <Field label="Blocked words" hint="Comma separated. Posts containing any of them are held back." count={words.length} max={500}>
        <Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="crypto, referral, dm me" maxLength={500} />
      </Field>
      <Button variant="primary" full loading={busy} onClick={save}>Save auto-moderation</Button>
    </div>
  );
}
