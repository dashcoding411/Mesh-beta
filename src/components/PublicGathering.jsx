import { useEffect, useState } from "react";
import { MapPin, Users, LogIn, CalendarX2 } from "lucide-react";
import { fetchPublicEvent, tsMillis } from "../lib/db";
import { usePageTitle } from "../lib/usePageTitle";
import { LogoMark } from "./shell/Sidebar";
import RichText from "./ui/RichText";
import Button from "./ui/Button";
import { EmptyState, Skeleton } from "./ui/States";
import { DateBlock } from "./Events";
import { CalendarButtons } from "./GatheringPage";
import AuthPage from "./AuthPage";

// Signed-out view for public gatherings opened from an invite link.
export default function PublicGathering({ eventId }) {
  const [event, setEvent] = useState(undefined);
  const [signing, setSigning] = useState(false);
  usePageTitle(event?.title || "Gathering", 1);
  useEffect(() => { fetchPublicEvent(eventId).then(setEvent).catch(() => setEvent(null)); }, [eventId]);

  if (signing) return <AuthPage />;
  const date = event ? new Date(tsMillis(event.startsAt)) : null;

  return (
    <div className="min-h-dvh overflow-y-auto bg-canvas" data-scroll>
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
        <LogoMark size={28} />
        <span className="font-display text-title-3 font-extrabold tracking-tight">Mesh</span>
        <span className="flex-1" />
        <Button size="sm" icon={LogIn} onClick={() => setSigning(true)}>Sign in</Button>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        {event === undefined && <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24" /></div>}
        {event === null && (
          <EmptyState icon={CalendarX2} title="This gathering isn't public"
            body="It may be private, or it's been cancelled. If you were invited, sign in to see it."
            action={<Button variant="primary" onClick={() => setSigning(true)}>Sign in</Button>} />
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
              <Button variant="primary" className="mt-3" onClick={() => setSigning(true)}>Sign in or join to reply</Button>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
