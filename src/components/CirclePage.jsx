import { ArrowLeft, Check, Clock, ImagePlus, Lock, Settings2, UserPlus, Users, MessagesSquare, CalendarDays, ScrollText, ListChecks } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CircleAvatar, CircleBanner } from "./circle/CircleImages";
import {
  canJoinDirectly, fetchGroupById, fetchMembership, isCircleMod, joinGroup, leaveGroup, me,
  meetsAgeLimit, myJoinRequest, ROLES, createCircleChat, joinCircleChat, fetchEvents, fetchGuides, tsMillis,
} from "../lib/db";
import { navigate } from "../lib/router";
import { whenLabel } from "../lib/format";
import { Guides } from "./circle/Guides";
import { plural } from "../lib/format";
import { goBack } from "../lib/router";
import { usePageTitle } from "../lib/usePageTitle";
import { PrivacyBadge } from "./Circles";
import { About } from "./circle/About";
import { CircleGatherings } from "./circle/CircleGatherings";
import { Discussion } from "./circle/Discussion";
import { JoinDialog } from "./circle/JoinDialog";
import { ManageDialog } from "./circle/Manage";
import { Members } from "./circle/Members";
import { activeLimits } from "./circle/status";
import { useShell } from "./shell/ShellContext";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { ConfirmDialog } from "./ui/Dialog";
import IconButton from "./ui/IconButton";
import { EmptyState, Skeleton } from "./ui/States";
import Tabs from "./ui/Tabs";
import { useToast } from "./ui/toast-context";

const TABS = [
  { id: "discussion", label: "Discussion" },
  { id: "guides", label: "Guides" },
  { id: "gatherings", label: "Gatherings" },
  { id: "members", label: "Members" },
  { id: "about", label: "About" },
];

export default function CirclePage({ circleId }) {
  const toast = useToast();
  const [group, setGroup] = useState(undefined);
  usePageTitle(group?.name || null, 1);
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

  const { profile, inbox } = useShell();
  const [chatBusy, setChatBusy] = useState(false);

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

  // The circle's chat: the admin opens it once; members join themselves.
  const inChat = !!group.chatId && inbox.chats.some((c) => c.id === group.chatId);
  const openChat = async () => {
    setChatBusy(true);
    try {
      let id = group.chatId;
      if (!id) {
        id = await createCircleChat(group);
        await load();
      } else if (!inChat) {
        await joinCircleChat(group);
      }
      navigate(`/messages/${id}`);
    } catch {
      toast({ tone: "error", title: "Couldn't open the chat", body: "Try again in a moment." });
    } finally { setChatBusy(false); }
  };
  const refreshMembership = () => fetchMembership(circleId).then(setMembership).catch(() => {});

  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
      <CircleBanner group={group} className="h-40 sm:h-56">
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/10 to-transparent" />
        <IconButton icon={ArrowLeft} label="Back to Circles" tone="overlay" className="absolute left-2 top-[calc(0.5rem+env(safe-area-inset-top))]"
          onClick={() => goBack("/circles")} />
        {isOwner && (
          <Button size="sm" icon={ImagePlus} className="absolute bottom-14 right-3 !bg-black/45 !text-white backdrop-blur-sm hover:!bg-black/60"
            onClick={() => openManage("look")}>{group.bannerUrl ? "Edit look" : "Add a banner"}</Button>
        )}
      </CircleBanner>

      <div className="relative mx-auto -mt-12 max-w-3xl px-4 pb-16 md:px-6">
        <CircleAvatar group={group} size={88} className="mb-3 ring-4 ring-canvas" />
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
            {membership && (group.chatId || isOwner) && (
              <Button icon={MessagesSquare} loading={chatBusy} onClick={openChat}>
                {group.chatId ? (inChat ? "Chat" : "Join chat") : "Start a chat"}
              </Button>
            )}
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

        {canRead && <Featured group={group} member={!!membership} onTab={setTab} />}

        <Tabs variant="underline" label="Circle sections" value={tab} onChange={setTab} className="mt-5" tabs={TABS} />

        <div role="tabpanel" className="pt-5">
          {tab === "about" ? (
            <About group={group} memberCount={memberCount} limits={limits} />
          ) : !canRead ? (
            <EmptyState icon={Lock} title="This circle is private"
              body={pendingRequest ? "Your request is waiting for an admin." : oldEnough ? "Ask to join to see what's being shared." : `It's for people ${group.ageLimit} and over.`} />
          ) : tab === "discussion" ? (
            <Discussion group={group} membership={membership} onChanged={load} onReview={() => openManage("posts")} onPosted={refreshMembership} />
          ) : tab === "guides" ? (
            <Guides group={group} membership={membership} />
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

/* Beneath the header: the next gathering, the rules and the guides, so the
   things that matter most in a circle are one tap away. */
function Featured({ group, member, onTab }) {
  const [next, setNext] = useState(null);
  const [guides, setGuides] = useState(0);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    fetchEvents(group.id, { member }).then((list) => setNext(list.find((e) => tsMillis(e.startsAt) > now) || null)).catch(() => {});
    fetchGuides(group.id).then((l) => setGuides(l.length)).catch(() => {});
  }, [group.id, member, now]);
  const rules = (group.rules || "").split("\n").map((r) => r.trim()).filter(Boolean);
  const cards = [
    next && { key: "next", icon: CalendarDays, title: next.title, sub: whenLabel(tsMillis(next.startsAt), now), onClick: () => navigate(`/gatherings/${next.id}`) },
    rules.length > 0 && { key: "rules", icon: ScrollText, title: "Rules", sub: rules[0], onClick: () => onTab("about") },
    guides > 0 && { key: "guides", icon: ListChecks, title: guides === 1 ? "1 guide" : `${guides} guides`, sub: "Step by step", onClick: () => onTab("guides") },
  ].filter(Boolean);
  if (!cards.length) return null;
  return (
    <section aria-label="Featured" className="mt-5 flex gap-2 overflow-x-auto no-scrollbar">
      {cards.map(({ key, icon: Icon, title, sub, onClick }) => (
        <button key={key} type="button" onClick={onClick}
          className="press flex min-w-[180px] max-w-[260px] flex-1 items-center gap-3 rounded-card border border-line bg-surface p-3 text-left hover:border-line-strong">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Icon size={18} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block truncate text-callout font-semibold">{title}</span>
            <span className="block truncate text-caption text-fg-subtle">{sub}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
