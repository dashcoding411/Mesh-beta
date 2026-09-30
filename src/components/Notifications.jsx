import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, UserPlus, AtSign, ShieldCheck, CalendarDays, Blend, Bell, CheckCheck, UserCheck, Waves,
} from "lucide-react";
import { openStory } from "../lib/openStory";
import {
  markNoticesRead, deleteNotices, groupNotices, fetchUpcomingRsvps, openPost, openUserProfile, approveFollowRequest, declineFollowRequest, toggleFollow, me, tsMillis,
} from "../lib/db";
import { navigate } from "../lib/router";
import { shortTime, fullTime, plural, whenLabel, spanLabel } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import LiveAvatar from "./ui/LiveAvatar";
import Button from "./ui/Button";
import { EmptyState, Skeleton, Loading } from "./ui/States";
import { useToast } from "./ui/toast-context";

const ICONS = {
  like: { icon: Heart, className: "bg-like/15 text-like" },
  repost: { icon: Repeat2, className: "bg-success-text/15 text-success-text" },
  comment: { icon: MessageCircle, className: "bg-accent-soft text-accent-text" },
  mention: { icon: AtSign, className: "bg-accent-soft text-accent-text" },
  follow: { icon: UserPlus, className: "bg-accent-soft text-accent-text" },
  request: { icon: UserPlus, className: "bg-warning-text/15 text-warning-text" },
  accept: { icon: UserCheck, className: "bg-success-text/15 text-success-text" },
  family: { icon: ShieldCheck, className: "bg-accent-soft text-accent-text" },
  familyok: { icon: ShieldCheck, className: "bg-success-text/15 text-success-text" },
  familyask: { icon: ShieldCheck, className: "bg-warning-text/15 text-warning-text" },
  invite: { icon: CalendarDays, className: "bg-accent-soft text-accent-text" },
  joined: { icon: Blend, className: "bg-success-text/15 text-success-text" },
  storylike: { icon: Heart, className: "bg-like/15 text-like" },
  echo: { icon: Waves, className: "bg-accent-soft text-accent-text" },
};
const KEEP_DAYS = 90;

function bucketOf(ms, now) {
  const day = 86400000;
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  if (ms >= startToday) return "Today";
  if (ms >= startToday - 6 * day) return "This week";
  return "Earlier";
}

/* Notifications: who liked, commented, followed or mentioned you, and the
   invites waiting for an answer. Opening the page marks them read; the
   ones that were new stay under "New" until you leave. */
export default function Notifications() {
  const { notices, muted, blocked, following } = useShell();
  const [newIds, setNewIds] = useState(null);
  const marked = useRef(false);
  const [now] = useState(() => Date.now());

  // Gatherings you've replied to that start within a week: the reminders,
  // worked out from your own replies rather than sent by anyone.
  const [soon, setSoon] = useState([]);
  useEffect(() => {
    fetchUpcomingRsvps(10).then((list) => setSoon(list.filter((r) => tsMillis(r.startsAt) < now + 7 * 86400000))).catch(() => {});
  }, [now]);

  const visible = useMemo(() => (notices || []).filter((n) => !muted.has(n.actorId) && !blocked.has(n.actorId)), [notices, muted, blocked]);

  // Remember what was new when you arrived (once the list first loads)...
  if (notices && newIds === null) setNewIds(new Set(notices.filter((n) => !n.read).map((n) => n.id)));
  // ...then mark it all read, and clear out the old ones.
  useEffect(() => {
    if (!notices || marked.current) return;
    marked.current = true;
    markNoticesRead(notices).catch(() => {});
    const old = notices.filter((n) => tsMillis(n.createdAt) && now - tsMillis(n.createdAt) > KEEP_DAYS * 86400000).map((n) => n.id);
    deleteNotices(old).catch(() => {});
  }, [notices, now]);

  const sections = useMemo(() => {
    const out = [];
    const add = (title, list) => { if (list.length) out.push({ title, groups: groupNotices(list) }); };
    const fresh = newIds ? visible.filter((n) => newIds.has(n.id)) : [];
    const rest = newIds ? visible.filter((n) => !newIds.has(n.id)) : visible;
    add("New", fresh);
    for (const title of ["Today", "This week", "Earlier"]) add(title, rest.filter((n) => bucketOf(tsMillis(n.createdAt) || now, now) === title));
    return out;
  }, [visible, newIds, now]);

  return (
    <>
      <HomeHeader section="notifications" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] pb-16 md:border-x md:border-line md:min-h-full">
          {notices === null && (
            <Loading label="Loading notifications">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-4">
                  <Skeleton className="h-11 w-11 !rounded-full" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>
                </div>
              ))}
            </Loading>
          )}
          {soon.length > 0 && (
            <section aria-labelledby="n-soon">
              <h2 id="n-soon" className="px-4 pb-1 pt-5 text-label font-semibold uppercase tracking-wider text-fg-subtle">Coming up</h2>
              <ul>
                {soon.map((r) => {
                  const at = tsMillis(r.startsAt);
                  const started = at <= now;
                  const close = at - now < 2 * 3600000;
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => navigate(`/gatherings/${r.id}`)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface ${close ? "bg-warning-text/5" : ""}`}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                          <CalendarDays size={20} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-callout font-semibold text-fg">{r.title}</span>
                          <span className="block text-caption text-fg-subtle">
                            {started ? "Happening now" : `${whenLabel(at, now)} · in ${spanLabel(at - now)}`}
                            {r.location ? ` · ${r.location}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-caption font-semibold text-fg-muted">{{ going: "Going", interested: "Interested", maybe: "Maybe" }[r.status]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {notices && sections.length === 0 && soon.length === 0 && (
            <EmptyState icon={Bell} title="Nothing yet"
              body="When people like, comment on or share your posts, follow you or invite you somewhere, it shows up here." />
          )}
          {sections.map((s) => (
            <section key={s.title} aria-labelledby={`n-${s.title}`}>
              <h2 id={`n-${s.title}`} className="px-4 pb-1 pt-5 text-label font-semibold uppercase tracking-wider text-fg-subtle">{s.title}</h2>
              <ul>
                {s.groups.map((g) => <NoticeRow key={g.key} group={g} fresh={s.title === "New"} following={following} />)}
              </ul>
            </section>
          ))}
          {notices?.length > 0 && (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-caption text-fg-subtle">
              <CheckCheck size={16} aria-hidden="true" /> Notifications older than {KEEP_DAYS} days are cleared.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function NoticeRow({ group, fresh, following }) {
  const toast = useToast();
  const { setFollowing } = useShell();
  const [done, setDone] = useState("");
  const n = group.items[0];
  const others = new Set(group.items.map((x) => x.actorId)).size - 1;
  const who = <strong className="font-semibold text-fg">@{n.actorName}</strong>;
  const rest = others > 0 ? <> and {plural(others, "other")}</> : null;
  const quote = n.text ? <span className="text-fg-muted"> “{n.text}{n.text.length >= 140 ? "…" : ""}”</span> : null;
  const { icon: Icon, className } = ICONS[n.type] || ICONS.follow;

  const line = {
    like: <>{who}{rest} liked your post</>,
    repost: <>{who}{rest} reposted your post</>,
    comment: <>{who} commented:{quote}</>,
    mention: <>{who} mentioned you:{quote}</>,
    follow: <>{who} started following you</>,
    request: <>{who} asked to follow you</>,
    accept: <>{who} accepted your follow request</>,
    family: <>{who} wants to add parental controls to your account</>,
    familyok: <>{who} accepted parental controls</>,
    familyask: <>{who} asked you to change their limits{quote ? ":" : ""}{quote}</>,
    invite: <>{who} invited you to a gathering</>,
    joined: <>You&apos;re in: {who} let you into a circle</>,
    storylike: <>{who}{rest} liked your story</>,
    echo: <>{who} echoed your story:{quote}</>,
  }[n.type] || <>{who} did something new. Reload Mesh to see what.</>;

  const open = () => {
    if (["like", "repost", "comment", "mention"].includes(n.type) && n.postId) return openPost(n.postId);
    if (["family", "familyok", "familyask"].includes(n.type)) return navigate("/account/brick");
    if (n.type === "invite") return navigate(`/gatherings/${n.ref}`);
    if (n.type === "joined") return navigate(`/circles/${n.ref}`);
    if (n.type === "storylike" || n.type === "echo") return openStory(n.ref, { panel: "activity", tab: n.type === "echo" ? "echoes" : "viewers" });
    openUserProfile(n.actorId);
  };

  const act = async (fn, label) => {
    try { await fn(); setDone(label); } catch { toast({ tone: "error", title: "That didn't work", body: "Try again in a moment." }); }
  };

  let action = null;
  if (done) action = <span className="text-caption font-semibold text-fg-subtle">{done}</span>;
  else if (n.type === "request") {
    action = (
      <span className="flex gap-1.5">
        <Button size="sm" variant="primary" onClick={() => act(async () => {
          await approveFollowRequest({ id: n.actorId, username: n.actorName });
          deleteNotices([n.id]).catch(() => {});
        }, "Approved")}>Approve</Button>
        <Button size="sm" onClick={() => act(async () => {
          await declineFollowRequest({ id: n.actorId });
          deleteNotices([n.id]).catch(() => {});
        }, "Declined")}>Decline</Button>
      </span>
    );
  } else if ((n.type === "follow" || n.type === "accept") && !following.has(n.actorId) && n.actorId !== me()) {
    action = (
      <Button size="sm" onClick={() => act(async () => {
        const r = await toggleFollow({ id: n.actorId, username: n.actorName }, false);
        if (r === "following") setFollowing((prev) => new Set(prev).add(n.actorId));
      }, "Following")}>Follow back</Button>
    );
  } else if (n.type === "family" || n.type === "familyask") {
    action = <Button size="sm" onClick={() => navigate("/account/brick")}>Review</Button>;
  }

  const at = tsMillis(n.createdAt);
  return (
    <li className={`relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface ${fresh ? "bg-accent-soft/40" : ""}`}>
      <button type="button" onClick={open} className="absolute inset-0" aria-label={`${n.actorName}: open`} tabIndex={-1} />
      <span className="relative shrink-0">
        <LiveAvatar uid={n.actorId} profile={{ username: n.actorName, photoURL: n.actorPhoto }} size={44} />
        <span className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-canvas ${className}`}>
          <Icon size={13} strokeWidth={2.4} aria-hidden="true" fill={n.type === "like" || n.type === "storylike" ? "currentColor" : "none"} />
        </span>
      </span>
      <button type="button" onClick={open} className="relative min-w-0 flex-1 text-left">
        <span className="line-clamp-3 text-callout text-fg-muted">{line}</span>
        {at > 0 && <time dateTime={new Date(at).toISOString()} title={fullTime(at)} className="text-caption text-fg-subtle">{shortTime(at)}</time>}
      </button>
      {action && <span className="relative shrink-0">{action}</span>}
      {group.unread && !fresh && <span className="relative h-2 w-2 shrink-0 rounded-full bg-accent-text" aria-label="Unread" />}
    </li>
  );
}
