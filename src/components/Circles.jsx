import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Blend, CalendarDays, Globe, Lock, EyeOff, ChevronRight, CalendarPlus, Search as SearchIcon, Sparkles, X } from "lucide-react";
import { INTERESTS, interestById } from "../lib/interests";
import { useShell } from "./shell/ShellContext";
import { InterestToggles } from "./Interests";
import { fetchGroups, createGroup, CIRCLE_PRIVACY, fetchEvents, fetchInvitedEvents, fetchMyRsvps, fetchMembership } from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkName } from "../lib/moderation";
import { navigate } from "../lib/router";
import { plural } from "../lib/format";
import HomeHeader from "./shell/HomeHeader";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog from "./ui/Dialog";
import { Field, Input, Textarea } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton, InlineMessage } from "./ui/States";
import CirclePage from "./CirclePage";
import { GatheringCard, NewGatheringDialog } from "./Events";

/* Circles are communities; Gatherings are what they plan. One section,
   two tabs: you look for both in the same place. */
export default function Circles({ circleId, view }) {
  const [creating, setCreating] = useState(null); // 'circle' | 'gathering'
  const tab = view === "gatherings" ? "gatherings" : "circles";

  if (circleId) return <CirclePage circleId={circleId} />;

  return (
    <>
      <HomeHeader section="circles"
        actions={
          <Button size="sm" variant="primary" icon={tab === "circles" ? Plus : CalendarPlus} className="hidden md:inline-flex"
            onClick={() => setCreating(tab === "circles" ? "circle" : "gathering")}>
            {tab === "circles" ? "New circle" : "New gathering"}
          </Button>
        }>
        <Tabs variant="underline" label="Circles or gatherings" value={tab} className="px-2 md:px-4"
          onChange={(id) => navigate(id === "gatherings" ? "/circles?view=gatherings" : "/circles", { replace: true })}
          tabs={[{ id: "circles", label: "Circles" }, { id: "gatherings", label: "Gatherings" }]} />
      </HomeHeader>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-4 pb-16 pt-5 md:px-6">
          <Button full variant="secondary" icon={tab === "circles" ? Plus : CalendarPlus} className="mb-5 md:hidden"
            onClick={() => setCreating(tab === "circles" ? "circle" : "gathering")}>
            {tab === "circles" ? "Start a circle" : "Plan a gathering"}
          </Button>
          {tab === "circles" ? <CircleList onCreate={() => setCreating("circle")} /> : <GatheringList onCreate={() => setCreating("gathering")} />}
        </div>
      </div>

      {creating === "circle" && (
        <NewCircleDialog onClose={() => setCreating(null)} onCreated={(g) => { setCreating(null); navigate(`/circles/${g.id}`); }} />
      )}
      {creating === "gathering" && (
        <NewGatheringDialog onClose={() => setCreating(null)}
          onCreated={(ev) => { setCreating(null); navigate(`/gatherings/${ev.id}`); }} />
      )}
    </>
  );
}

const PRIVACY = {
  public: { label: "Public", icon: Globe, tone: "neutral" },
  private: { label: "Private", icon: Lock, tone: "warning" },
  hidden: { label: "Hidden", icon: EyeOff, tone: "neutral" },
};

export function PrivacyBadge({ privacy }) {
  const p = PRIVACY[privacy] || PRIVACY.public;
  return <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>;
}

/* Your circles first, then circles that match your interests, then the
   rest. A search box and interest chips narrow all three. */
function CircleList({ onCreate }) {
  const { interests, openInterests } = useShell();
  const [groups, setGroups] = useState(null);
  const [mine, setMine] = useState(new Set());
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("all");
  const [allChips, setAllChips] = useState(false);
  const load = useCallback(async () => {
    try {
      const list = await fetchGroups();
      setGroups(list);
      setError(false);
      const flags = await Promise.all(list.map((g) => fetchMembership(g.id).then((m) => (m ? g.id : null)).catch(() => null)));
      setMine(new Set(flags.filter(Boolean)));
    } catch { setError(true); }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // Your interests lead the chip row; the rest follow so anything can be browsed.
  const chipIds = useMemo(() => {
    const yours = (interests || []).filter((id) => interestById(id));
    return [...yours, ...INTERESTS.map((i) => i.id).filter((id) => !yours.includes(id))];
  }, [interests]);

  const shown = useMemo(() => {
    if (!groups) return null;
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return groups.filter((g) => {
      if (topic !== "all" && !(g.interests || []).includes(topic)) return false;
      if (!words.length) return true;
      const hay = [g.name, g.description, ...(g.interests || []).map((id) => interestById(id)?.label || "")].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [groups, q, topic]);

  if (error) return <ErrorState title="Couldn't load circles" onRetry={() => { setError(false); setGroups(null); load(); }} />;
  if (groups === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 !rounded-card" />)}</div>;
  if (!groups.length) {
    return (
      <EmptyState icon={Blend} title="No circles yet"
        body="Circles are communities with their own rules, limits, admins and gatherings. Start one for your people."
        action={<Button variant="primary" icon={Plus} onClick={onCreate}>Start a circle</Button>} />
    );
  }

  const mineSet = new Set(interests || []);
  const overlap = (g) => (g.interests || []).filter((id) => mineSet.has(id)).length;
  const yours = shown.filter((g) => mine.has(g.id));
  const rest = shown.filter((g) => !mine.has(g.id));
  const matched = rest.filter((g) => overlap(g) > 0)
    .sort((a, b) => overlap(b) - overlap(a) || (b.memberCount || 0) - (a.memberCount || 0));
  const others = rest.filter((g) => overlap(g) === 0);
  const filtering = q.trim() || topic !== "all";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <label htmlFor="circle-search" className="sr-only">Find circles</label>
          <Input id="circle-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Find circles by name or interest" className="!pl-10" />
        </div>
        <div role="radiogroup" aria-label="Filter circles by interest" className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
          {[{ id: "all", label: "All" }, ...chipIds.map((id) => interestById(id))]
            // On wide screens the full list wraps to four rows; show your
            // interests and a few more until asked. Phones scroll sideways.
            .filter((c, i) => allChips || i <= Math.max(8, (interests || []).length + 4) || c.id === topic)
            .map((c) => {
            const on = topic === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setTopic(c.id)}
                className={`press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold transition-colors ${
                  on ? "bg-fg text-canvas" : mineSet.has(c.id) ? "bg-accent-soft text-fg hover:bg-surface-3" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                }`}>
                {c.icon && <c.icon size={13} aria-hidden="true" />}{c.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setAllChips((x) => !x)} aria-expanded={allChips}
            className="press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold text-accent-text hover:underline">
            {allChips ? "Fewer" : "More interests"}
          </button>
        </div>
        {!(interests || []).length && (
          <button type="button" onClick={openInterests}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-caption font-semibold text-accent-ring">
            <Sparkles size={14} aria-hidden="true" /> Pick your interests to see circles for you
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{filtering ? `${shown.length} circles found` : ""}</p>
      {shown.length === 0 ? (
        <EmptyState compact icon={SearchIcon} title="No circles match"
          body={topic !== "all" ? `Nobody has started a ${interestById(topic)?.label.toLowerCase()} circle yet. It could be yours.` : "Try other words, or start the circle you're looking for."}
          action={<div className="flex flex-wrap justify-center gap-2">
            {filtering && <Button icon={X} onClick={() => { setQ(""); setTopic("all"); }}>Clear filters</Button>}
            <Button variant="primary" icon={Plus} onClick={onCreate}>Start a circle</Button>
          </div>} />
      ) : (
        <div className="space-y-8">
          {yours.length > 0 && <CircleSection title="Your circles" groups={yours} highlight={mineSet} />}
          {matched.length > 0 && <CircleSection title="For your interests" groups={matched} highlight={mineSet} />}
          {others.length > 0 && <CircleSection title={yours.length || matched.length ? "Discover" : "All circles"} groups={others} highlight={mineSet} />}
        </div>
      )}
    </div>
  );
}

function CircleSection({ title, groups, highlight }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-title-3">{title}</h2>
      <ul className="space-y-3 stagger">
        {groups.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => navigate(`/circles/${g.id}`)}
              className="press flex w-full items-center gap-4 overflow-hidden rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong">
              <span className={`h-16 w-16 shrink-0 rounded-control bg-gradient-to-br ${g.coverColor || "from-violet-600 via-fuchsia-600 to-rose-500"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-title-3">{g.name}</span>
                  <PrivacyBadge privacy={g.privacy} />
                </span>
                {g.description && <span className="mt-0.5 line-clamp-1 block text-callout text-fg-muted">{g.description}</span>}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                  <span>{plural(g.memberCount || 0, "member")}{g.ageLimit ? ` · ${g.ageLimit}+` : ""}</span>
                  {(g.interests || []).map((id) => {
                    const it = interestById(id);
                    return it ? (
                      <span key={id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold ${
                        highlight?.has(id) ? "bg-accent-soft text-fg" : "bg-surface-2 text-fg-muted"
                      }`}>
                        <it.icon size={11} aria-hidden="true" />{it.label}
                      </span>
                    ) : null;
                  })}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Private gatherings you've been invited to, then everything public. */
function GatheringList({ onCreate }) {
  const [events, setEvents] = useState(null);
  const [invited, setInvited] = useState([]);
  const [rsvps, setRsvps] = useState(new Map());
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, inv] = await Promise.all([fetchEvents(), fetchInvitedEvents().catch(() => [])]);
      const upcoming = (e) => (e.startsAt?.toMillis?.() || 0) > Date.now() - 86400000;
      setEvents(list.filter(upcoming));
      setInvited(inv.filter(upcoming));
      setError(false);
      setRsvps(await fetchMyRsvps([...list, ...inv].map((e) => e.id)).catch(() => new Map()));
    } catch { setError(true); }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (error) return <ErrorState title="Couldn't load gatherings" onRetry={() => { setError(false); setEvents(null); load(); }} />;
  if (events === null) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 !rounded-card" />)}</div>;
  if (!events.length && !invited.length) {
    return (
      <EmptyState icon={CalendarDays} title="Nothing planned yet"
        body="Gatherings are events: a run, a dinner, a stream. Put one on the calendar."
        action={<Button variant="primary" icon={CalendarPlus} onClick={onCreate}>Plan a gathering</Button>} />
    );
  }

  return (
    <div className="space-y-8">
      {invited.length > 0 && (
        <section aria-label="Invited">
          <h2 className="mb-3 text-title-3">You're invited</h2>
          <div className="space-y-3">{invited.map((ev) => <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null} />)}</div>
        </section>
      )}
      {events.length > 0 && (
        <section aria-label="Upcoming">
          <h2 className="mb-3 text-title-3">Upcoming</h2>
          <div className="space-y-3 stagger">{events.map((ev) => <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null} />)}</div>
        </section>
      )}
    </div>
  );
}

function NewCircleDialog({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [topics, setTopics] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const trimmed = name.trim();
    if (trimmed.length < LIMITS.groupName.min || trimmed.length > LIMITS.groupName.max) {
      errs.name = `Names need ${LIMITS.groupName.min}–${LIMITS.groupName.max} characters.`;
    } else if (checkName(trimmed).error) errs.name = checkName(trimmed).error;
    const vDesc = validateText(description, LIMITS.groupDescription, "Description");
    if (vDesc.error) errs.description = vDesc.error;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      onCreated(await createGroup({ name: trimmed, description: vDesc.text, privacy, interests: topics }));
    } catch (err) {
      console.error(err);
      setErrors({ submit: "Couldn't create the circle. Check your connection and try again." });
      setBusy(false);
    }
  };

  const icons = { public: Globe, private: Lock, hidden: EyeOff };

  return (
    <Dialog title="Start a circle" onClose={onClose} variant="full" size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="circle-form" variant="primary" loading={busy}>Create circle</Button>
          </div>
        </div>
      }>
      <form id="circle-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" error={errors.name} count={name.length} max={LIMITS.groupName.max}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.groupName.max} placeholder="e.g. Melbourne Night Runners" />
        </Field>
        <Field label="What's it about?" optional error={errors.description} count={description.length} max={LIMITS.groupDescription}>
          <Textarea autoGrow rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.groupDescription} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-callout font-medium">Interests <span className="font-normal text-fg-subtle">Up to 3, so the right people find it</span></legend>
          <InterestToggles value={topics} onChange={setTopics} max={3} label="Circle interests" />
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-callout font-medium">Who can see it?</legend>
          <div className="space-y-2">
            {CIRCLE_PRIVACY.map((p) => {
              const Icon = icons[p.id] || Globe;
              return (
                <label key={p.id} className={`press flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                  privacy === p.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
                }`}>
                  <input type="radio" name="privacy" value={p.id} checked={privacy === p.id}
                    onChange={() => setPrivacy(p.id)} className="mt-1 h-4 w-4 accent-violet-600" />
                  <span>
                    <span className="flex items-center gap-1.5 text-callout font-semibold"><Icon size={14} aria-hidden="true" />{p.label}</span>
                    <span className="block text-caption text-fg-muted">{p.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
