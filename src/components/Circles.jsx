import { useCallback, useEffect, useState } from "react";
import { Plus, Blend, CalendarDays, Globe, Lock, EyeOff, ChevronRight, CalendarPlus } from "lucide-react";
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

/* Your circles first, then the rest to discover. */
function CircleList({ onCreate }) {
  const [groups, setGroups] = useState(null);
  const [mine, setMine] = useState(new Set());
  const [error, setError] = useState(false);
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

  if (error) return <ErrorState title="Couldn't load circles" onRetry={() => { setError(false); setGroups(null); load(); }} />;
  if (groups === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 !rounded-card" />)}</div>;
  if (!groups.length) {
    return (
      <EmptyState icon={Blend} title="No circles yet"
        body="Circles are communities with their own rules, limits, admins and gatherings. Start one for your people."
        action={<Button variant="primary" icon={Plus} onClick={onCreate}>Start a circle</Button>} />
    );
  }

  const yours = groups.filter((g) => mine.has(g.id));
  const others = groups.filter((g) => !mine.has(g.id));
  return (
    <div className="space-y-8">
      {yours.length > 0 && <CircleSection title="Your circles" groups={yours} />}
      {others.length > 0 && <CircleSection title={yours.length ? "Discover" : "All circles"} groups={others} />}
    </div>
  );
}

function CircleSection({ title, groups }) {
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
                <span className="mt-1 block text-caption text-fg-subtle">
                  {plural(g.memberCount || 0, "member")}{g.ageLimit ? ` · ${g.ageLimit}+` : ""}
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
      onCreated(await createGroup({ name: trimmed, description: vDesc.text, privacy }));
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
