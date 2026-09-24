import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { MapPin, Ticket, ChevronDown, Megaphone, Users, Check, Globe, Lock, ExternalLink } from "lucide-react";
import {
  createEvent, setRsvp, RSVP_OPTIONS, fetchGuestList, fetchAnnouncements, postAnnouncement, me, openUserProfile,
} from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent, checkName, markPosted } from "../lib/moderation";
import { shortTime } from "../lib/format";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog from "./ui/Dialog";
import { Field, Input, Textarea, Checkbox } from "./ui/Field";
import { InlineMessage, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* A gathering card. Public gatherings take Going / Interested (Interested is
   a bookmark that still gets reminders); private ones take Going / Maybe /
   Can't go so the host gets an honest headcount. */
export function GatheringCard({ event, myStatus, onStatusChange }) {
  const toast = useToast();
  const [status, setStatus] = useState(myStatus);
  const [going, setGoing] = useState(event.goingCount || 0);
  const [interested, setInterested] = useState(event.interestedCount || 0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const date = event.startsAt?.toDate ? event.startsAt.toDate() : null;
  const past = date && date < new Date();
  const options = RSVP_OPTIONS[event.privacy === "private" ? "private" : "public"];
  const isHost = event.hostId === me();

  const choose = async (next) => {
    if (busy) return;
    setBusy(true);
    const prev = status;
    try {
      const result = await setRsvp(event, prev, next);
      setStatus(result);
      const delta = (s, dir) => {
        if (s === "going") setGoing((c) => c + dir);
        if (s === "interested") setInterested((c) => c + dir);
      };
      if (prev) delta(prev, -1);
      if (result) delta(result, +1);
      onStatusChange?.(event.id, result);
    } catch {
      toast({ tone: "error", title: "Couldn't save your reply" });
    } finally { setBusy(false); }
  };

  return (
    <article aria-labelledby={`ev-${event.id}`}
      className={`rounded-card border border-line bg-surface p-4 ${past ? "opacity-70" : ""}`}>
      <div className="flex gap-4">
        {date && (
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-control bg-surface-2" aria-hidden="true">
            <span className="text-label font-semibold uppercase text-accent-text">{date.toLocaleDateString(undefined, { month: "short" })}</span>
            <span className="text-title-2 leading-none tabular">{date.getDate()}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-caption font-semibold text-accent-text">
              {date ? date.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }) : "Date to be confirmed"}
            </p>
            {past && <Badge>Past</Badge>}
            <Badge tone={event.privacy === "private" ? "warning" : "neutral"} icon={event.privacy === "private" ? Lock : Globe}>
              {event.privacy === "private" ? "Private" : "Public"}
            </Badge>
          </div>
          <h3 id={`ev-${event.id}`} className="mt-1 text-title-3">{event.title}</h3>
          {event.location && (
            <p className="mt-1 flex items-center gap-1.5 text-callout text-fg-muted"><MapPin size={14} aria-hidden="true" />{event.location}</p>
          )}
          {event.description && <p className="mt-2 whitespace-pre-wrap break-words text-callout text-fg-muted">{event.description}</p>}
          <p className="mt-2 text-caption text-fg-subtle">
            Hosted by{" "}
            <button type="button" onClick={() => openUserProfile(event.hostId)} className="font-medium text-fg-muted hover:underline">@{event.hostName}</button>
            {" · "}{going} going{event.privacy !== "private" && interested > 0 && ` · ${interested} interested`}
          </p>
        </div>
      </div>

      {!past && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Your reply">
          {options.map((o) => (
            <Button key={o.id} size="sm" variant={status === o.id ? "primary" : "secondary"} disabled={busy}
              icon={status === o.id ? Check : undefined} aria-pressed={status === o.id} onClick={() => choose(o.id)}>
              {o.label}
            </Button>
          ))}
          {event.ticketUrl && (
            <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer nofollow ugc"
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line-strong px-3 text-callout font-semibold text-accent-text hover:bg-surface-2">
              <Ticket size={16} aria-hidden="true" /> Tickets <ExternalLink size={12} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-callout font-medium text-fg-muted hover:text-fg">
        Announcements and guests
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <GatheringDetail event={event} isHost={isHost} />}
    </article>
  );
}

function GatheringDetail({ event, isHost }) {
  const [announcements, setAnnouncements] = useState(null);
  const [guests, setGuests] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAnnouncements(event.id).then(setAnnouncements).catch(() => setAnnouncements([]));
    const visible = event.showGuestList || isHost;
    (visible ? fetchGuestList(event.id) : Promise.resolve([])).then(setGuests).catch(() => setGuests([]));
  }, [event.id, event.showGuestList, isHost]);

  const send = async (e) => {
    e.preventDefault();
    const v = validateText(text, 1000, "Announcement");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "announce", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setError("");
    setBusy(true);
    try {
      const item = await postAnnouncement(event.id, v.text);
      setAnnouncements((prev) => [...(prev || []), item]);
      setText("");
    } catch { setError("Couldn't post that. Your message is still here."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 space-y-5 border-t border-line pt-4">
      <section aria-label="Announcements">
        <p className="mb-2 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
          <Megaphone size={13} aria-hidden="true" /> Announcements
        </p>
        {announcements === null && <Spinner className="text-fg-subtle" />}
        {announcements?.length === 0 && <p className="text-callout text-fg-muted">No announcements yet.</p>}
        <ul className="space-y-2">
          {announcements?.map((a, i) => (
            <li key={a.id || i} className="rounded-control bg-surface-2 p-3 text-callout">
              <span className="font-semibold">@{a.authorName}</span> <span className="text-fg-muted">{a.text}</span>
              <span className="ml-2 text-caption text-fg-subtle">{shortTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
        {isHost && (
          <form onSubmit={send} className="mt-3 flex items-start gap-2">
            <label htmlFor={`ann-${event.id}`} className="sr-only">New announcement</label>
            <Input id={`ann-${event.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your guests something" />
            <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>Post</Button>
          </form>
        )}
        <div aria-live="polite" className="mt-1"><InlineMessage>{error}</InlineMessage></div>
      </section>

      <section aria-label="Guests">
        <p className="mb-2 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
          <Users size={13} aria-hidden="true" /> Guests
        </p>
        {!event.showGuestList && !isHost ? (
          <p className="text-callout text-fg-muted">The host has kept the guest list private.</p>
        ) : guests === null ? (
          <Spinner className="text-fg-subtle" />
        ) : guests.length === 0 ? (
          <p className="text-callout text-fg-muted">Nobody has replied yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {guests.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => openUserProfile(g.id)}
                  className="press inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3 text-caption font-medium hover:bg-surface-3">
                  @{g.username || g.id.slice(0, 8)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* Plan a gathering. Date first after the title: it's the one thing
   everyone needs to know. */
export function NewGatheringDialog({ onClose, onCreated, groupId = "" }) {
  const [form, setForm] = useState({
    title: "", description: "", location: "", when: "",
    privacy: groupId ? "private" : "public", ticketUrl: "", showGuestList: true,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const title = form.title.trim();
    if (title.length < LIMITS.eventTitle.min || title.length > LIMITS.eventTitle.max) {
      errs.title = `Give it a name of ${LIMITS.eventTitle.min}–${LIMITS.eventTitle.max} characters.`;
    } else if (checkName(title).error) errs.title = checkName(title).error;
    const vDesc = validateText(form.description, LIMITS.eventDescription, "Details");
    if (vDesc.error) errs.description = vDesc.error;
    const vLoc = validateText(form.location, LIMITS.eventLocation, "Location");
    if (vLoc.error) errs.location = vLoc.error;
    const when = new Date(form.when);
    if (!form.when) errs.when = "Pick a date and time.";
    else if (isNaN(when) || when < new Date()) errs.when = "Pick a date and time in the future.";
    if (form.ticketUrl && !/^https?:\/\/\S+\.\S+/.test(form.ticketUrl.trim())) errs.ticketUrl = "Use a full link, starting https://";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const event = await createEvent({
        title, description: vDesc.text, location: vLoc.text,
        startsAt: Timestamp.fromDate(when), privacy: form.privacy, groupId,
        ticketUrl: form.ticketUrl.trim(), showGuestList: form.showGuestList,
      });
      markPosted("gathering", title);
      onCreated(event);
    } catch (err) {
      console.error(err);
      setErrors({ submit: "Couldn't create the gathering. Check your connection. Everything you entered is still here." });
      setBusy(false);
    }
  };

  return (
    <Dialog title="Plan a gathering" onClose={onClose} variant="full" size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="gathering-form" variant="primary" loading={busy}>Create gathering</Button>
          </div>
        </div>
      }>
      <form id="gathering-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" error={errors.title} count={form.title.length} max={LIMITS.eventTitle.max}>
          <Input value={form.title} onChange={set("title")} maxLength={LIMITS.eventTitle.max} placeholder="e.g. Sunday park run" />
        </Field>
        <Field label="Date and time" error={errors.when}>
          <Input type="datetime-local" value={form.when} onChange={set("when")} />
        </Field>
        <Field label="Where" optional error={errors.location}>
          <Input value={form.location} onChange={set("location")} maxLength={LIMITS.eventLocation} placeholder="A place, or a link for online" />
        </Field>
        <Field label="Details" optional error={errors.description} count={form.description.length} max={LIMITS.eventDescription}>
          <Textarea autoGrow rows={3} value={form.description} onChange={set("description")} maxLength={LIMITS.eventDescription} />
        </Field>
        <Field label="Ticket link" optional error={errors.ticketUrl}>
          <Input type="url" value={form.ticketUrl} onChange={set("ticketUrl")} placeholder="https://" autoCapitalize="none" />
        </Field>

        {!groupId && (
          <fieldset>
            <legend className="mb-2 text-callout font-medium">Who can come?</legend>
            <div className="space-y-2">
              {[
                { id: "public", label: "Public", blurb: "Anyone can find it. People reply Going or Interested.", icon: Globe },
                { id: "private", label: "Private", blurb: "Invite only. People reply Going, Maybe or Can't go.", icon: Lock },
              ].map((p) => (
                <label key={p.id} className={`press flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                  form.privacy === p.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
                }`}>
                  <input type="radio" name="eventPrivacy" checked={form.privacy === p.id}
                    onChange={() => setForm({ ...form, privacy: p.id })} className="mt-1 h-4 w-4 accent-violet-600" />
                  <span>
                    <span className="flex items-center gap-1.5 text-callout font-semibold"><p.icon size={14} aria-hidden="true" />{p.label}</span>
                    <span className="block text-caption text-fg-muted">{p.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Checkbox checked={form.showGuestList} onChange={(v) => setForm({ ...form, showGuestList: v })}
          description="Turn off to keep the guest list between you and each guest.">
          Let guests see who else is coming
        </Checkbox>
      </form>
    </Dialog>
  );
}
