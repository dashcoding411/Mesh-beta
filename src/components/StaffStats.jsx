import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Lock, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { ACTIVITY_SINCE, fetchStaffStats, staffRole } from "../lib/db";
import { navigate } from "../lib/router";
import { activeCounts, freshBursts, retention, signupsByDay } from "../lib/stats";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Skeleton } from "./ui/States";

// The other dashboards, one tap away. Visits and where they come from are
// Cloudflare's; sign-ins and database use are Firebase's.
const ELSEWHERE = [
  { label: "Visitors and where they come from", where: "Cloudflare Web Analytics", url: "https://dash.cloudflare.com/?to=/:account/web-analytics" },
  { label: "Searches that find Mesh", where: "Google Search Console", url: "https://search.google.com/search-console" },
  { label: "Accounts and sign-in methods", where: "Firebase Authentication", url: "https://console.firebase.google.com/project/mesh-a293c/authentication/users" },
  { label: "Database reads and writes", where: "Firebase usage", url: "https://console.firebase.google.com/project/mesh-a293c/firestore/usage" },
  { label: "Google ad earnings", where: "AdSense", url: "https://www.google.com/adsense/new" },
  { label: "Video storage and requests", where: "Cloudflare R2 and Workers", url: "https://dash.cloudflare.com/?to=/:account/workers-and-pages" },
];

const fmt = (n) => (n === null || n === undefined ? "–" : n.toLocaleString());
const pct = (m) => (m && m.rate !== null ? `${m.rate}%` : "–");

/** Staff only: how many people use Mesh, whether they come back, and what's being made. */
export default function StaffStats() {
  const [role, setRole] = useState(undefined);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(0);
  const now = stats?.at || 0;

  useEffect(() => { staffRole().then((r) => setRole(r === "admin" ? r : null)).catch(() => setRole(null)); }, []);

  useEffect(() => {
    if (!role) return undefined;
    let live = true;
    const at = Date.now();
    fetchStaffStats(at).then((s) => { if (live) setStats({ ...s, at }); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [role, round]);
  const load = () => { setStats(null); setError(false); setRound((n) => n + 1); };

  const active = useMemo(() => (stats?.activity ? activeCounts(stats.activity, now) : null), [stats, now]);
  const kept = useMemo(() => (stats?.activity ? retention(stats.activity, now, ACTIVITY_SINCE) : null), [stats, now]);
  const days = useMemo(() => (stats?.signups ? signupsByDay(stats.signups, now) : null), [stats, now]);
  const bursts = useMemo(() => (stats?.fresh ? freshBursts(stats.fresh) : null), [stats]);
  const week = days ? days.slice(-7).reduce((s, d) => s + d.count, 0) : null;
  const month = days ? days.reduce((s, d) => s + d.count, 0) : null;

  return (
    <>
      <TopBar back backTo="/account/settings" desktop title={<p className="truncate text-title-3">Stats</p>}
        right={role ? <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load} disabled={!stats && !error}>Refresh</Button> : null} />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-5 md:px-6">
          {role === null && <EmptyState icon={Lock} title="Staff only" body="This page is for Mesh admins and moderators." />}
          {role && error && <ErrorState title="Couldn't load the stats" onRetry={load} />}
          {role && !error && !stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24 !rounded-card" />)}</div>
          )}
          {role && stats && (
            <div className="space-y-8">
              <Section title="People">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile label="Accounts" value={fmt(stats.members)} />
                  <Tile label="Joined in 7 days" value={fmt(week)} sub={month !== null ? `${fmt(month)} in 30 days` : ""} />
                  <Tile label="Active in 7 days" value={fmt(active?.weekly)} sub={active ? `${fmt(active.daily)} today` : ""} />
                  <Tile label="Active in 30 days" value={fmt(active?.monthly)}
                    sub={active && active.stickiness !== null ? `${active.stickiness}% come back daily` : ""} />
                </div>
                {days && <SignupChart days={days} />}
              </Section>

              <Section title="Do people come back?"
                note={`Of people who joined since ${new Date(ACTIVITY_SINCE).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}, when Mesh started counting, and long enough ago to tell. Active counts include anyone who has opened Mesh since then.`}>
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Next day" value={pct(kept?.day1)} sub={kept ? `of ${fmt(kept.day1.of)}` : ""} />
                  <Tile label="Second week" value={pct(kept?.week2)} sub={kept ? `of ${fmt(kept.week2.of)}` : ""} />
                  <Tile label="After a month" value={pct(kept?.month)} sub={kept ? `of ${fmt(kept.month.of)}` : ""} />
                </div>
              </Section>

              <Section title="What's being made">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <Tile label="Public posts, 7 days" value={fmt(stats.posts)} />
                  <Tile label="Upcoming gatherings" value={fmt(stats.gatherings)} />
                  <Tile label="Circles" value={fmt(stats.circles)} />
                  <Tile label="News stories" value={fmt(stats.stories)} />
                  <Tile label="Open reports" value={fmt(stats.reports)} />
                </div>
              </Section>

              <Section title="Possible fake crowds"
                note="Posts that got 8 or more likes, comments or reposts within an hour from accounts under a week old, in the last day. A farm of new accounts looks like this, but so can a real post at O-Week, when everyone is new: open it and look before acting.">
                <FakeCrowds bursts={bursts} />
              </Section>

              <Section title="Everything else" note="Each opens in a new tab, signed in as you.">
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {ELSEWHERE.map((e) => (
                    <li key={e.url}>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-callout font-semibold">{e.label}</span>
                          <span className="block text-caption text-fg-muted">{e.where}</span>
                        </span>
                        <ExternalLink size={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>

              <p className="text-caption text-fg-subtle">
                Loading this page reads each account that joined in the last 30 days, every activity record and the last day's likes, comments and reposts from new accounts, so it uses some of the free database allowance. Refresh only when you need to.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, note, children }) {
  return (
    <section>
      <h2 className="text-title-3">{title}</h2>
      {note && <p className="mt-1 text-caption text-fg-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const KIND_NAMES = { like: ["like", "likes"], "comment like": ["comment like", "comment likes"], comment: ["comment", "comments"], repost: ["repost", "reposts"] };
const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function FakeCrowds({ bursts }) {
  if (!bursts) return <p className="text-callout text-fg-muted">Couldn't check. Refresh to try again.</p>;
  if (!bursts.length) {
    return (
      <p className="flex items-center gap-2 rounded-card border border-line bg-surface p-4 text-callout text-fg-muted">
        <ShieldCheck size={18} className="shrink-0 text-success-text" aria-hidden="true" /> Nothing in the last day.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {bursts.slice(0, 20).map((b) => (
        <li key={b.postId}>
          <button type="button" onClick={() => navigate(`/p/${b.postId}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
            <Users size={18} className="shrink-0 text-warning-text" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-callout font-semibold">{b.count} from new accounts, {clock(b.from)} to {clock(b.to)}</span>
              <span className="block text-caption text-fg-muted">
                {Object.entries(b.kinds).map(([k, n]) => `${n} ${KIND_NAMES[k]?.[n === 1 ? 0 : 1] || k}`).join(", ")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-caption font-medium text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-title-1 tabular">{value}</p>
      {sub && <p className="text-caption text-fg-subtle">{sub}</p>}
    </div>
  );
}

function SignupChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <figure className="mt-3 rounded-card border border-line bg-surface p-4">
      <figcaption className="text-caption font-medium text-fg-muted">Sign-ups, last 30 days</figcaption>
      <div className="mt-3 flex h-28 items-end gap-[3px]" role="img"
        aria-label={`Sign-ups per day for 30 days, most on one day ${max}. Today ${days[days.length - 1].count}.`}>
        {days.map((d) => (
          <span key={d.day} title={`${label(d.day)}: ${d.count}`} className="flex-1 rounded-t-[3px] bg-accent"
            style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-caption text-fg-subtle">
        <span>{label(days[0].day)}</span><span>Today</span>
      </div>
    </figure>
  );
}
