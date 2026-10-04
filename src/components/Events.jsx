import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { MapPin, Globe, Lock, Users, ChevronRight, Check, Aperture } from "lucide-react";
import { createEvent, isEventFull, friendsGoingLabel, startGatheringRoll } from "../lib/db";
import Avatar from "./ui/Avatar";
import { LIMITS, validateText } from "../lib/validate";
import { checkName, markPosted } from "../lib/moderation";
import { navigate } from "../lib/router";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog from "./ui/Dialog";
import { Field, Input, Textarea, Checkbox } from "./ui/Field";
import { InlineMessage } from "./ui/States";

const STATUS_LABEL = { going: "Going", interested: "Interested", maybe: "Maybe", cant: "Can't go" };

export function DateBlock({ date, size = 56 }) {
  if (!date) return null;
  return (
    <div style={{ width: size, height: size }} aria-hidden="true"
      className="flex shrink-0 flex-col items-center justify-center rounded-control bg-surface-2">
      <span className="text-label font-semibold uppercase text-accent-text">{date.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="text-title-2 leading-none tabular">{date.getDate()}</span>
    </div>
  );
}

export function FriendsLine({ friends, people }) {
  if (!friends?.length) return null;
  return (
    <span className="mt-2 flex items-center gap-2 text-caption font-medium text-fg-muted">
      <span className="flex -space-x-2" aria-hidden="true">
        {friends.slice(0, 3).map((f) => (
          <span key={f.id} className="rounded-full ring-2 ring-surface"><Avatar profile={people?.get(f.id) || { username: f.username }} size={20} /></span>
        ))}
      </span>
      <span className="min-w-0 truncate">{friendsGoingLabel(friends)}</span>
    </span>
  );
}

export function GatheringCard({ event, myStatus, friends, people }) {
  const date = event.startsAt?.toDate ? event.startsAt.toDate() : null;
  const past = date && date < new Date();
  const full = isEventFull(event);

  return (
    <button type="button" onClick={() => navigate(`/gatherings/${event.id}`)}
      className={`press flex w-full items-center gap-4 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong ${past ? "opacity-70" : ""}`}>
      <DateBlock date={date} />
      <span className="min-w-0 flex-1">
        <span className="block text-caption font-semibold text-accent-text">
          {date ? date.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }) : "Date to be confirmed"}
        </span>
        <span className="mt-0.5 block truncate text-title-3">{event.title}</span>
        {event.location && (
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-caption text-fg-muted"><MapPin size={13} aria-hidden="true" />{event.location}</span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={event.privacy === "private" ? "warning" : "neutral"} icon={event.privacy === "private" ? Lock : Globe}>
            {event.privacy === "private" ? "Private" : "Public"}
          </Badge>
          <Badge icon={Users}>
            {event.capacity ? `${event.goingCount || 0} of ${event.capacity} going` : `${event.goingCount || 0} going`}
          </Badge>
          {full && !past && <Badge tone="danger">Full</Badge>}
          {past && <Badge>Past</Badge>}
          {myStatus && <Badge tone="accent" icon={Check}>{STATUS_LABEL[myStatus]}</Badge>}
        </span>
        <FriendsLine friends={friends} people={people} />
      </span>
      <ChevronRight size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
    </button>
  );
}

// Shared by create and edit.
export function GatheringForm({ initial, groupId = "", submitLabel, onSubmit, onClose, title }) {
  const toLocal = (ts) => {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [form, setForm] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    location: initial?.location || "",
    when: toLocal(initial?.startsAt),
    privacy: initial?.privacy || (groupId ? "private" : "public"),
    ticketUrl: initial?.ticketUrl || "",
    showGuestList: initial?.showGuestList ?? true,
    capacity: initial?.capacity ? String(initial.capacity) : "",
    guestPosting: initial?.guestPosting || "guests",
    roll: false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const name = form.title.trim();
    if (name.length < LIMITS.eventTitle.min || name.length > LIMITS.eventTitle.max) {
      errs.title = `Give it a name of ${LIMITS.eventTitle.min} to ${LIMITS.eventTitle.max} characters.`;
    } else if (checkName(name).error) errs.title = checkName(name).error;
    const vDesc = validateText(form.description, LIMITS.eventDescription, "Details");
    if (vDesc.error) errs.description = vDesc.error;
    const vLoc = validateText(form.location, LIMITS.eventLocation, "Location");
    if (vLoc.error) errs.location = vLoc.error;
    const when = new Date(form.when);
    if (!form.when) errs.when = "Pick a date and time.";
    else if (isNaN(when) || (!initial && when < new Date())) errs.when = "Pick a date and time in the future.";
    if (form.ticketUrl && !/^https?:\/\/\S+\.\S+/.test(form.ticketUrl.trim())) errs.ticketUrl = "Use a full link, starting https://";
    const cap = form.capacity.trim() === "" ? 0 : Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 0 || cap > 100000) errs.capacity = "Use a whole number, or leave it blank for no limit.";
    else if (cap > 0 && initial && cap < (initial.goingCount || 0)) {
      errs.capacity = `${initial.goingCount} people are already going. Set at least that, or leave it blank.`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await onSubmit({
        title: name, description: vDesc.text, location: vLoc.text,
        startsAt: Timestamp.fromDate(when), privacy: form.privacy,
        ticketUrl: form.ticketUrl.trim(), showGuestList: form.showGuestList,
        capacity: cap, guestPosting: form.guestPosting,
      }, { roll: form.roll && !initial?.rollId });
    } catch (err) {
      console.error(err);
      setErrors({ submit: err?.code === "permission-denied"
        ? "That was turned down. In some circles only admins can plan gatherings."
        : "Couldn't save the gathering. Check your connection. Everything you entered is still here." });
      setBusy(false);
    }
  };

  // Render helper, called rather than mounted.
  const Radio = ({ name, value, options, onChange }) => (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className={`press flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
          value === o.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
        }`}>
          <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
          <span>
            <span className="flex items-center gap-1.5 text-callout font-semibold">{o.icon && <o.icon size={14} aria-hidden="true" />}{o.label}</span>
            <span className="block text-caption text-fg-muted">{o.blurb}</span>
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <Dialog title={title} onClose={onClose} variant="full" size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="gathering-form" variant="primary" loading={busy}>{submitLabel}</Button>
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

        <fieldset>
          <legend className="mb-2 text-callout font-medium">Who can come</legend>
          {Radio({
            name: "eventPrivacy", value: form.privacy, onChange: (v) => setForm({ ...form, privacy: v }),
            options: [
              { id: "public", label: "Public", icon: Globe, blurb: "Anyone can find it and reply Going or Interested." },
              { id: "private", label: "Private", icon: Lock, blurb: groupId
                ? "Circle members and people you invite. Replies are Going, Maybe or Can't go."
                : "Only people you invite. Replies are Going, Maybe or Can't go." },
            ],
          })}
        </fieldset>

        <Field label="Capacity" optional error={errors.capacity}
          hint="The most people who can say they're going. Leave blank for no limit. Once it's full, Going is closed.">
          <Input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, "") })} placeholder="No limit" />
        </Field>

        <fieldset>
          <legend className="mb-2 text-callout font-medium">Who can post in the discussion</legend>
          {Radio({
            name: "guestPosting", value: form.guestPosting, onChange: (v) => setForm({ ...form, guestPosting: v }),
            options: [
              { id: "guests", label: "Everyone who replies", blurb: "Guests can post once they've replied Going, Interested or Maybe." },
              { id: "host", label: "Only you", blurb: "Use it for announcements. Guests can still like posts." },
            ],
          })}
        </fieldset>

        <Field label="Ticket link" optional error={errors.ticketUrl}>
          <Input type="url" value={form.ticketUrl} onChange={set("ticketUrl")} placeholder="https://" autoCapitalize="none" />
        </Field>

        <Checkbox checked={form.showGuestList} onChange={(v) => setForm({ ...form, showGuestList: v })}
          description="Turn off to keep the guest list between you and each guest.">
          Let guests see who else is coming
        </Checkbox>

        {initial?.rollId ? (
          <p className="flex items-center gap-2 text-callout text-fg-muted"><Aperture size={16} className="text-accent-text" aria-hidden="true" /> This gathering has a roll.</p>
        ) : (
          <Checkbox checked={form.roll} onChange={(v) => setForm({ ...form, roll: v })}
            description="A shared disposable camera for everyone coming: 27 shots each, nobody sees a thing, and it develops at 9am the morning after.">
            Add a roll
          </Checkbox>
        )}
      </form>
    </Dialog>
  );
}

export function NewGatheringDialog({ onClose, onCreated, groupId = "" }) {
  return (
    <GatheringForm title="Plan a gathering" submitLabel="Create gathering" groupId={groupId} onClose={onClose}
      onSubmit={async (fields, { roll }) => {
        const event = await createEvent({ ...fields, groupId });
        markPosted("gathering", fields.title);
        // The gathering is made either way; a roll that fails can be added from its page.
        const r = roll ? await startGatheringRoll(event).catch(() => null) : null;
        onCreated(r ? { ...event, rollId: r.id } : event);
      }} />
  );
}
