import { CalendarDays, CalendarPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchEvents, fetchMyRsvps } from "../../lib/db";
import { navigate } from "../../lib/router";
import { GatheringCard, NewGatheringDialog } from "../Events";
import { useFriendsGoing } from "../../lib/useFriendsGoing";
import { postingStatus } from "./status";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";

export function CircleGatherings({ group, membership }) {
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(false);
  const status = postingStatus(group, membership);
  const { friends, people } = useFriendsGoing(events);

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
        {events?.map((ev) => <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null} friends={friends.get(ev.id)} people={people} />)}
      </div>
      {creating && (
        <NewGatheringDialog groupId={group.id} onClose={() => setCreating(false)}
          onCreated={(ev) => { setCreating(false); navigate(`/gatherings/${ev.id}`); }} />
      )}
    </>
  );
}
