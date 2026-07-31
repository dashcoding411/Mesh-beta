import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  createEvent, setRsvp, RSVP_OPTIONS, fetchGuestList,
  fetchAnnouncements, postAnnouncement, me, timeAgo, openUserProfile,
} from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent, checkName, markPosted } from "../lib/moderation";

const FIELD =
  "w-full min-h-[44px] rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-base " +
  "focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

/* A gathering shows different RSVP options depending on its privacy:
   public ones take Going/Interested (Interested behaves like a bookmark that
   still gets reminders); private ones take Going/Maybe/Can't go so the host
   gets an exact headcount. */
export function GatheringCard({ event, myStatus, onStatusChange, compact }) {
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
    } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition ${past ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-violet-400">
            {date
              ? date.toLocaleString(undefined, {
                  weekday: "short", day: "numeric", month: "short",
                  hour: "numeric", minute: "2-digit",
                })
              : "Date to be confirmed"}
            {past && " · past"}
          </p>
          <h3 className="font-bold mt-1">{event.title}</h3>
          {event.location && <p className="text-sm text-zinc-400 mt-0.5">{event.location}</p>}
          {!compact && event.description && (
            <p className="text-sm text-zinc-400 mt-2 whitespace-pre-wrap break-words">{event.description}</p>
          )}
          <p className="text-xs text-zinc-500 mt-2">
            Hosted by{" "}
            <button onClick={() => openUserProfile(event.hostId)} className="hover:text-violet-300">
              @{event.hostName}
            </button>
            {" · "}{going} going{event.privacy !== "private" && interested > 0 && ` · ${interested} interested`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          event.privacy === "private" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
        }`}>
          {event.privacy === "private" ? "Private" : "Public"}
        </span>
      </div>

      {!past && (
        <div className="flex flex-wrap gap-2 mt-3">
          {options.map((o) => (
            <button key={o.id} onClick={() => choose(o.id)} disabled={busy}
              aria-pressed={status === o.id}
              className={`min-h-[40px] rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 ${
                status === o.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}>
              {status === o.id ? `✓ ${o.label}` : o.label}
            </button>
          ))}
        </div>
      )}

      {event.ticketUrl && (
        <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-[40px] items-center rounded-xl border border-violet-500/50 px-4 text-sm font-semibold text-violet-300 hover:bg-violet-600/10">
          Get tickets
        </a>
      )}

      <button onClick={() => setOpen((o) => !o)}
        className="mt-3 block text-xs text-zinc-500 hover:text-zinc-300">
        {open ? "Hide details" : "Announcements & guests"}
      </button>

      {open && <GatheringDetail event={event} isHost={isHost} />}
    </div>
  );
}

function GatheringDetail({ event, isHost }) {
  const [announcements, setAnnouncements] = useState(null);
  const [guests, setGuests] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAnnouncements(event.id).then(setAnnouncements).catch(() => setAnnouncements([]));
    const visible = event.showGuestList || isHost;
    (visible ? fetchGuestList(event.id) : Promise.resolve([]))
      .then(setGuests)
      .catch(() => setGuests([]));
  }, [event.id, event.showGuestList, isHost]);

  const send = async (e) => {
    e.preventDefault();
    const v = validateText(text, 1000, "Announcement");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "announce", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setError("");
    try {
      const item = await postAnnouncement(event.id, v.text);
      setAnnouncements((prev) => [...(prev || []), item]);
      setText("");
    } catch { setError("Couldn't post that."); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 mb-1.5">Announcements</p>
        {announcements === null && <p className="text-xs text-zinc-500">Loading…</p>}
        {announcements?.length === 0 && <p className="text-xs text-zinc-600">No announcements yet.</p>}
        <div className="space-y-1.5">
          {announcements?.map((a, i) => (
            <p key={a.id || i} className="text-sm text-zinc-300">
              <span className="font-semibold">@{a.authorName}</span> {a.text}
              <span className="ml-2 text-xs text-zinc-600">{timeAgo(a.createdAt)}</span>
            </p>
          ))}
        </div>
        {isHost && (
          <form onSubmit={send} className="flex gap-2 mt-2">
            <input className={`${FIELD} text-sm`} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Tell your guests something…" aria-label="New announcement" />
            <button className="min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
              Post
            </button>
          </form>
        )}
        <div aria-live="polite">{error && <p className="text-xs text-red-400 mt-1">{error}</p>}</div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 mb-1.5">Guests</p>
        {!event.showGuestList && !isHost ? (
          <p className="text-xs text-zinc-600">The host has hidden the guest list.</p>
        ) : guests?.length === 0 ? (
          <p className="text-xs text-zinc-600">Nobody has replied yet.</p>
        ) : (
          <p className="text-sm text-zinc-300">
            {guests?.map((g) => `@${g.username || g.id}`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function NewGatheringForm({ onClose, onCreated, groupId = "" }) {
  const [form, setForm] = useState({
    title: "", description: "", location: "", when: "",
    privacy: groupId ? "private" : "public", ticketUrl: "", showGuestList: true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const title = form.title.trim();
    if (title.length < LIMITS.eventTitle.min || title.length > LIMITS.eventTitle.max) {
      return setError(`Title must be ${LIMITS.eventTitle.min}–${LIMITS.eventTitle.max} characters.`);
    }
    const nameCheck = checkName(title);
    if (nameCheck.error) return setError(nameCheck.error);
    const vDesc = validateText(form.description, LIMITS.eventDescription, "Details");
    if (vDesc.error) return setError(vDesc.error);
    const vLoc = validateText(form.location, LIMITS.eventLocation, "Location");
    if (vLoc.error) return setError(vLoc.error);
    if (!form.when) return setError("Pick a date and time.");
    const when = new Date(form.when);
    if (isNaN(when) || when < new Date()) return setError("Pick a date in the future.");
    if (form.ticketUrl && !/^https?:\/\/\S+\.\S+/.test(form.ticketUrl.trim())) {
      return setError("Ticket link must be a full URL.");
    }

    setBusy(true);
    try {
      const event = await createEvent({
        title, description: vDesc.text, location: vLoc.text,
        startsAt: Timestamp.fromDate(when), privacy: form.privacy, groupId,
        ticketUrl: form.ticketUrl.trim(), showGuestList: form.showGuestList,
      });
      markPosted("gathering");
      onCreated(event);
    } catch (err) {
      console.error(err);
      setError("Couldn't create the gathering. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade"
      role="dialog" aria-modal="true" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-3 anim-pop">
        <h3 className="font-bold text-lg">New gathering</h3>

        <input className={FIELD} placeholder="What's happening?" value={form.title}
          onChange={set("title")} maxLength={LIMITS.eventTitle.max} aria-label="Title" autoFocus />
        <input className={FIELD} type="datetime-local" value={form.when}
          onChange={set("when")} aria-label="Date and time" />
        <input className={FIELD} placeholder="Where? (optional)" value={form.location}
          onChange={set("location")} maxLength={LIMITS.eventLocation} aria-label="Location" />
        <textarea className={`${FIELD} h-20 resize-none`} placeholder="Details (optional)"
          value={form.description} onChange={set("description")}
          maxLength={LIMITS.eventDescription} aria-label="Details" />
        <input className={FIELD} placeholder="Ticket link (optional)" value={form.ticketUrl}
          onChange={set("ticketUrl")} aria-label="Ticket link" />

        {!groupId && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-300 mb-1">Who's invited?</legend>
            {[
              { id: "public", label: "Public", blurb: "Anyone can find it. Going or Interested." },
              { id: "private", label: "Private", blurb: "Invite only. Going, Maybe or Can't go." },
            ].map((p) => (
              <label key={p.id}
                className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  form.privacy === p.id ? "border-violet-500 bg-violet-600/10" : "border-zinc-800 hover:border-zinc-700"
                }`}>
                <input type="radio" name="eventPrivacy" checked={form.privacy === p.id}
                  onChange={() => setForm({ ...form, privacy: p.id })} className="mt-0.5 accent-violet-600" />
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-zinc-500">{p.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="flex items-center gap-2.5 cursor-pointer py-1">
          <input type="checkbox" checked={form.showGuestList}
            onChange={(e) => setForm({ ...form, showGuestList: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-600" />
          <span className="text-sm text-zinc-300">Let guests see who else is coming</span>
        </label>

        <div aria-live="polite" className="min-h-[1rem]">
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <button disabled={busy}
          className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-sm font-semibold">
          {busy ? "Creating…" : "Create gathering"}
        </button>
      </form>
    </div>
  );
}
