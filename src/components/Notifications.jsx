import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, CheckCheck, ChevronRight, Sparkles, X } from "lucide-react";
import {
  markNoticesRead, deleteNotices, groupNotices, fetchUpcomingRsvps, approveFollowRequest, declineFollowRequest, toggleFollow, me, tsMillis,
} from "../lib/db";
import { openNotice } from "../lib/notices";
import { NoticeAvatar, NoticeLine } from "./NoticeParts";
import { navigate } from "../lib/router";
import { shortTime, fullTime, whenLabel, spanLabel } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { EmptyState, Skeleton, Loading } from "./ui/States";
import { useToast } from "./ui/toast-context";

const KEEP_DAYS = 90;

function bucketOf(ms, now) {
  const day = 86400000;
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  if (ms >= startToday) return "Today";
  if (ms >= startToday - 6 * day) return "This week";
  return "Earlier";
}

// Opening marks everything read; items unread on arrival stay under "New" for the visit.
export default function Notifications() {
  const { notices, muted, blocked, following } = useShell();
  const [newIds, setNewIds] = useState(null);
  const marked = useRef(false);
  const [now] = useState(() => Date.now());

  // Upcoming RSVPs within a week, derived locally.
  const [soon, setSoon] = useState([]);
  useEffect(() => {
    fetchUpcomingRsvps(10).then((list) => setSoon(list.filter((r) => tsMillis(r.startsAt) < now + 7 * 86400000))).catch(() => {});
  }, [now]);

  const visible = useMemo(() => (notices || []).filter((n) => !muted.has(n.actorId) && !blocked.has(n.actorId)), [notices, muted, blocked]);

  if (notices && newIds === null) setNewIds(new Set(notices.filter((n) => !n.read).map((n) => n.id)));
  // Mark read and prune old notifications.
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
        <div className="mx-auto max-w-[640px] pb-16">
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
          <WeekReady />
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

// Saturday and Sunday: "Your week on Mesh" is ready, once per week unless dismissed.
const weekSeenKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `mesh:week-seen:${d.toDateString()}`;
};

function WeekReady() {
  const [hidden, setHidden] = useState(() => {
    const day = new Date().getDay();
    if (![6, 0].includes(day)) return true;
    try { return !!localStorage.getItem(weekSeenKey()); } catch { return true; }
  });
  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(weekSeenKey(), "1"); } catch { /* storage blocked */ }
    setHidden(true);
  };
  return (
    <div className="mx-4 mt-4 flex items-center gap-1 rounded-card border border-line bg-surface pr-1">
      <button type="button" onClick={() => { dismiss(); navigate("/account/week"); }}
        className="press flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Sparkles size={20} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-semibold">Your week on Mesh is ready</span>
          <span className="block text-caption text-fg-muted">Time on Mesh, gatherings, posts and more</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
      </button>
      <IconButton icon={X} label="Dismiss" size={16} onClick={dismiss} />
    </div>
  );
}

function NoticeRow({ group, fresh, following }) {
  const toast = useToast();
  const { setFollowing } = useShell();
  const [done, setDone] = useState("");
  const n = group.items[0];
  const others = new Set(group.items.map((x) => x.actorId)).size - 1;
  const open = () => openNotice(n);

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
      <span className="relative flex shrink-0"><NoticeAvatar n={n} /></span>
      <button type="button" onClick={open} className="relative min-w-0 flex-1 text-left">
        <span className="line-clamp-3 text-callout text-fg-muted"><NoticeLine n={n} others={others} /></span>
        {at > 0 && <time dateTime={new Date(at).toISOString()} title={fullTime(at)} className="text-caption text-fg-subtle">{shortTime(at)}</time>}
      </button>
      {action && <span className="relative shrink-0">{action}</span>}
      {group.unread && !fresh && <span className="relative h-2 w-2 shrink-0 rounded-full bg-accent-text" aria-label="Unread" />}
    </li>
  );
}
