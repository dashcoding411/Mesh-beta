import { useEffect, useState } from "react";
import { fetchGroups, createGroup, timeAgo, CIRCLE_PRIVACY, fetchEvents, fetchMyRsvps } from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkName } from "../lib/moderation";
import CirclePage from "./CirclePage";
import { GatheringCard, NewGatheringForm } from "./Events";

/* Circles are communities; Gatherings are the moments those communities plan.
   They share one surface because you look for both in the same place — a
   separate events tab was dead weight in the rail. */
export default function Circles({ profile }) {
  const [view, setView] = useState("circles"); // 'circles' | 'gatherings'
  const [active, setActive] = useState(null);

  if (active) return <CirclePage group={active} profile={profile} onBack={() => setActive(null)} />;

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold mb-1">Circles</h2>
        <p className="text-sm text-zinc-400 mb-5">Communities you're part of, and what they've got planned.</p>

        <div role="tablist" className="flex rounded-xl bg-zinc-900 p-1 mb-5 max-w-xs">
          {[["circles", "Circles"], ["gatherings", "Gatherings"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition ${
                view === id ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {view === "circles" ? <CircleList onOpen={setActive} /> : <GatheringList />}
      </div>
    </div>
  );
}

function CircleList({ onOpen }) {
  const [groups, setGroups] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchGroups().then(setGroups).catch((e) => { console.error(e); setGroups([]); });
  }, []);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)}
          className="min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
          New circle
        </button>
      </div>

      {groups === null && <p className="text-zinc-400">Loading circles…</p>}
      {groups?.length === 0 && (
        <div className="text-center text-zinc-400 mt-16">
          <p className="text-lg font-semibold text-zinc-300">No circles yet</p>
          <p className="text-sm mt-1">Start one for your people.</p>
        </div>
      )}

      <div className="space-y-3 stagger">
        {groups?.map((g) => (
          <button key={g.id} onClick={() => onOpen(g)}
            className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-violet-600/50 transition">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{g.name}</p>
              <PrivacyPill privacy={g.privacy} />
            </div>
            {g.description && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{g.description}</p>}
            <p className="text-xs text-zinc-400 mt-2">
              {g.memberCount || 0} member{g.memberCount === 1 ? "" : "s"} · created {timeAgo(g.createdAt)}
            </p>
          </button>
        ))}
      </div>

      {showCreate && (
        <NewCircleModal onClose={() => setShowCreate(false)}
          onCreated={(g) => { setGroups((prev) => [g, ...(prev || [])]); setShowCreate(false); onOpen(g); }} />
      )}
    </>
  );
}

export function PrivacyPill({ privacy }) {
  const map = {
    public: ["Public", "bg-emerald-500/15 text-emerald-400"],
    private: ["Private", "bg-amber-500/15 text-amber-400"],
    hidden: ["Hidden", "bg-zinc-700/40 text-zinc-400"],
  };
  const [label, cls] = map[privacy] || map.public;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function GatheringList() {
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    await Promise.resolve();
    try {
      const list = await fetchEvents();
      setEvents(list);
      setRsvps(await fetchMyRsvps(list.map((e) => e.id)).catch(() => new Map()));
    } catch (err) { console.error(err); setEvents([]); }
  };

  useEffect(() => { (async () => { await load(); })(); }, []);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)}
          className="min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
          New gathering
        </button>
      </div>

      {events === null && <p className="text-zinc-400">Loading gatherings…</p>}
      {events?.length === 0 && (
        <div className="text-center text-zinc-400 mt-16">
          <p className="text-lg font-semibold text-zinc-300">Nothing planned</p>
          <p className="text-sm mt-1">Get something on the calendar.</p>
        </div>
      )}

      <div className="space-y-3 stagger">
        {events?.map((ev) => (
          <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null}
            onStatusChange={(id, status) => setRsvps((prev) => {
              const next = new Map(prev);
              if (status) next.set(id, status); else next.delete(id);
              return next;
            })} />
        ))}
      </div>

      {showCreate && (
        <NewGatheringForm onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </>
  );
}

function NewCircleModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const field =
    "w-full min-h-[44px] rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-base " +
    "focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < LIMITS.groupName.min || trimmed.length > LIMITS.groupName.max) {
      return setError(`Name must be ${LIMITS.groupName.min}–${LIMITS.groupName.max} characters.`);
    }
    const nameCheck = checkName(trimmed);
    if (nameCheck.error) return setError(nameCheck.error);
    const vDesc = validateText(description, LIMITS.groupDescription, "Description");
    if (vDesc.error) return setError(vDesc.error);

    setBusy(true);
    try {
      onCreated(await createGroup({ name: trimmed, description: vDesc.text, privacy }));
    } catch (err) {
      console.error(err);
      setError("Couldn't create the circle. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade"
      role="dialog" aria-modal="true" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4 anim-pop">
        <h3 className="font-bold text-lg">New circle</h3>

        <input className={field} placeholder="Circle name" value={name}
          onChange={(e) => setName(e.target.value)} maxLength={LIMITS.groupName.max}
          aria-label="Circle name" autoFocus />
        <textarea className={`${field} h-20 resize-none`} placeholder="What's this circle about?"
          value={description} onChange={(e) => setDescription(e.target.value)}
          maxLength={LIMITS.groupDescription} aria-label="Description" />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-300 mb-1.5">Who can see it?</legend>
          {CIRCLE_PRIVACY.map((p) => (
            <label key={p.id}
              className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition ${
                privacy === p.id ? "border-violet-500 bg-violet-600/10" : "border-zinc-800 hover:border-zinc-700"
              }`}>
              <input type="radio" name="privacy" value={p.id} checked={privacy === p.id}
                onChange={() => setPrivacy(p.id)} className="mt-0.5 accent-violet-600" />
              <span>
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-zinc-400">{p.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div aria-live="polite" className="min-h-[1rem]">
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <button disabled={busy}
          className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-sm font-semibold">
          {busy ? "Creating…" : "Create circle"}
        </button>
      </form>
    </div>
  );
}
