import { useEffect, useState } from "react";
import { MapPin, Users, CalendarX2 } from "lucide-react";
import { fetchPublicEvent, tsMillis } from "../lib/db";
import { authPath, navigate } from "../lib/router";
import { usePageTitle } from "../lib/usePageTitle";
import TopBar from "./shell/TopBar";
import RichText from "./ui/RichText";
import Button from "./ui/Button";
import { EmptyState, Skeleton } from "./ui/States";
import { DateBlock } from "./Events";
import { CalendarButtons } from "./GatheringPage";

// Signed-out view of a public gathering.
export default function PublicGathering({ eventId }) {
  const [event, setEvent] = useState(undefined);
  usePageTitle(event?.title || "Gathering", 1);
  useEffect(() => { fetchPublicEvent(eventId).then(setEvent).catch(() => setEvent(null)); }, [eventId]);

  const logIn = () => navigate(authPath("login"));
  const date = event ? new Date(tsMillis(event.startsAt)) : null;

  return (
    <>
      <TopBar back backTo="/circles?view=gatherings" desktop title={<p className="truncate text-title-3">Gathering</p>} />
      <div className="min-h-0 flex-1 overflow-y-auto" data-scroll>
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
          {event === undefined && <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24" /></div>}
          {event === null && (
            <EmptyState icon={CalendarX2} title="This gathering isn't public"
              body="It may be private, or it's been cancelled. If you were invited, log in to see it."
              action={<Button variant="primary" onClick={logIn}>Log in</Button>} />
          )}
          {event && (
            <article>
              <div className="flex gap-4">
                <DateBlock date={date} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="text-callout font-semibold text-accent-text">
                    {date.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}
                  </p>
                  <h1 className="mt-1 font-display text-title-1">{event.title}</h1>
                  {event.location && <p className="mt-1 flex items-center gap-1.5 text-callout text-fg-muted"><MapPin size={15} aria-hidden="true" />{event.location}</p>}
                </div>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-caption text-fg-subtle">
                <Users size={14} aria-hidden="true" /> {event.goingCount || 0} going · hosted by @{event.hostName}
              </p>
              {event.description && <RichText text={event.description} className="mt-4 text-body text-fg" />}
              <CalendarButtons event={event} />
              <div className="mt-8 rounded-card border border-line bg-surface p-4">
                <p className="text-callout font-semibold">Going?</p>
                <p className="mt-1 text-caption text-fg-muted">Reply, see who else is coming and join the discussion with a free Mesh account.</p>
                <Button variant="primary" className="mt-3" onClick={logIn}>Log in to reply</Button>
              </div>
            </article>
          )}
        </div>
      </div>
    </>
  );
}
