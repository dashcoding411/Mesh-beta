import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, MapPin, X } from "lucide-react";
import { fetchUpcomingPublicEvents, fetchMyRsvps, tsMillis } from "../lib/db";
import { areaChoices, groupWhatsOn, inArea } from "../lib/whatson";
import { authPath, navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import HelpLink from "./ui/HelpLink";
import { GatheringCard, NewGatheringDialog } from "./Events";
import { useFriendsGoing } from "../lib/useFriendsGoing";
import Button from "./ui/Button";
import { Input } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton } from "./ui/States";

const AREA_KEY = "mesh:whatson-area";
const readArea = () => { try { return localStorage.getItem(AREA_KEY) || ""; } catch { return ""; } };

/** Public gatherings coming up, by day, near the area you type. Open to everyone, signed in or not. */
export default function WhatsOn() {
  const { guest } = useShell();
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [error, setError] = useState(false);
  const [area, setAreaState] = useState(readArea);
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());

  const setArea = (v) => {
    setAreaState(v);
    try { if (v.trim()) localStorage.setItem(AREA_KEY, v.trim()); else localStorage.removeItem(AREA_KEY); } catch { /* storage blocked */ }
  };

  const load = useCallback(async () => {
    try {
      const list = await fetchUpcomingPublicEvents();
      setEvents(list);
      setError(false);
      if (!guest) setRsvps(await fetchMyRsvps(list.map((e) => e.id)).catch(() => new Map()));
    } catch { setError(true); }
  }, [guest]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const upcoming = useMemo(() => (events || []).filter((e) => tsMillis(e.startsAt) >= now - 3 * 3600000), [events, now]);
  const choices = useMemo(() => areaChoices(upcoming.map((e) => e.location)), [upcoming]);
  const shown = useMemo(() => upcoming.filter((e) => inArea(e.location, area)), [upcoming, area]);
  const groups = useMemo(() => groupWhatsOn(shown, now, (e) => tsMillis(e.startsAt)), [shown, now]);
  const { friends, people } = useFriendsGoing(shown);

  const plan = () => (guest ? navigate(authPath("signup")) : setCreating(true));

  return (
    <>
      <HomeHeader section="whatson" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-4 md:px-6">
          <HelpLink guide="gatherings">How gatherings work</HelpLink>

          <div className="mt-4">
            <label htmlFor="whatson-area" className="mb-1.5 block text-callout font-medium">Near</label>
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <Input id="whatson-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Your suburb or city" className="!pl-10 !pr-10"
                autoComplete="address-level2" maxLength={60} />
              {area && (
                <button type="button" onClick={() => setArea("")} aria-label="Clear the area"
                  className="press absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {choices.length > 1 && (
              <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0" aria-label="Places with gatherings">
                {choices.map((c) => {
                  const on = area.trim().toLowerCase() === c.toLowerCase();
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => setArea(on ? "" : c)}
                      className={`press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold transition-colors ${
                        on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                      }`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6">
            {error && <ErrorState title="Couldn't load what's on" onRetry={() => { setError(false); setEvents(null); load(); }} />}
            {!error && events === null && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 !rounded-card" />)}</div>}
            {events && groups.length === 0 && (
              <EmptyState icon={CalendarDays} title={area ? `Nothing coming up near ${area.trim()}` : "Nothing coming up yet"}
                body={area ? "Try a nearby suburb or the city, or clear the area to see everything." : "Be the first: a run, a dinner, a study session."}
                action={<Button variant="primary" icon={CalendarPlus} onClick={plan}>{guest ? "Sign up to plan one" : "Plan a gathering"}</Button>} />
            )}
            {groups.length > 0 && (
              <div className="space-y-8">
                {groups.map((g) => (
                  <section key={g.id} aria-labelledby={`whatson-${g.id}`}>
                    <h2 id={`whatson-${g.id}`} className="mb-3 text-title-3">{g.title}</h2>
                    <div className="space-y-3">
                      {g.events.map((ev) => (
                        <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null} friends={friends.get(ev.id)} people={people} />
                      ))}
                    </div>
                  </section>
                ))}
                <div className="rounded-card border border-line bg-surface p-4">
                  <p className="text-callout font-semibold">Putting something on?</p>
                  <Button size="sm" variant="primary" icon={CalendarPlus} className="mt-3" onClick={plan}>{guest ? "Sign up to plan one" : "Plan a gathering"}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {creating && (
        <NewGatheringDialog onClose={() => setCreating(false)} onCreated={(ev) => { setCreating(false); navigate(`/gatherings/${ev.id}`); }} />
      )}
    </>
  );
}
