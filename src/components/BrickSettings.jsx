import { useEffect, useState } from "react";
import {
  BrickWall, CalendarClock, Timer, Plus, X, Hourglass, Users, ShieldCheck, Clock, Check, Info, UserPlus, Trophy, Flame, Share2,
} from "lucide-react";
import {
  SECTIONS, DAYS, DAY_NAMES, COOL_OFF_MS, emptyLayer, windowsToSlots, windowLabel, clockLabel, isTighterOrSame,
  looseningParts, lockState, pendingDueAt, hasAnyLimit, deviceOffset, nextMidnight, parentActive,
} from "../lib/brick";
import {
  saveOwnLimits, cancelPending, brickUntil, requestTimeZoneChange, fetchMyFamilyLink, fetchMyTeens, inviteTeen,
  acceptFamilyInvite, declineFamilyInvite, removeFamilyLink, saveParentLimits, answerParentRequest,
  requestParentChange, withdrawParentRequest, listenLock, fetchProfile, fetchUsageFor, deleteNotices,
  fetchBrickStats, setStatsPublic, weekKeyFor,
} from "../lib/db";
import { durationLabel } from "../lib/format";
import { navigate } from "../lib/router";
import Switch from "./ui/Switch";
import { useBrick } from "../lib/useBrick";
import { useShell } from "./shell/ShellContext";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import Badge from "./ui/Badge";
import { Field, Input, Select, Textarea, Checkbox } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { whenLabel, spanLabel } from "../lib/format";
import { usePageTitle } from "../lib/usePageTitle";

const CAP_CHOICES = [0, 10, 15, 20, 30, 45, 60, 90, 120, 180];
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
const utcLabel = (offset) => `UTC${offset >= 0 ? "+" : "-"}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, "0")}` : ""}`;

/* Brick mode: lock Mesh down to messages and calls, on your terms, and make
   it deliberately slow to undo. Stricter applies now; looser waits a day. */
export default function BrickSettings() {
  usePageTitle("Brick mode", 1);
  const { profile } = useShell();
  const brick = useBrick();
  const toast = useToast();
  const { policy, raw, usage, now } = brick;
  const self = policy?.self || emptyLayer();
  const [confirm, setConfirm] = useState(null); // { next, parts }
  const [instant, setInstant] = useState(null); // ms
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const lockNow = brick.state("");
  const opens = lockNow ? brick.opensAt("") : null;
  const due = pendingDueAt(policy);

  const save = async (next) => {
    if (policy && !isTighterOrSame(next, self, now)) {
      setConfirm({ next, parts: looseningParts(next, self, now) });
      return;
    }
    setBusy(true);
    try {
      await saveOwnLimits(policy, raw, next);
      toast({ title: "Saved", body: "Stricter limits apply straight away." });
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "Couldn't save your limits", body: "Check your connection and try again." });
    } finally { setBusy(false); }
  };

  const queueLoosening = async () => {
    setBusy(true);
    try {
      await saveOwnLimits(policy, raw, confirm.next);
      toast({ title: "Change waiting", body: `It takes effect ${whenLabel(Date.now() + COOL_OFF_MS)}. You can cancel it before then.` });
      setConfirm(null);
    } catch {
      toast({ tone: "error", title: "Couldn't queue that change" });
    } finally { setBusy(false); }
  };

  const doBrick = async () => {
    setBusy(true);
    try {
      await brickUntil(policy, raw, instant);
      toast({ title: `Bricked until ${whenLabel(instant)}` });
      setInstant(null);
    } catch {
      toast({ tone: "error", title: "Couldn't brick Mesh", body: "Check your connection and try again." });
    } finally { setBusy(false); }
  };

  const removeWindow = (w) => {
    const windows = self.windows.filter((x) => x !== w);
    save({ ...self, windows, slots: windowsToSlots(windows) });
  };
  const addWindow = (w) => {
    const windows = [...self.windows, w];
    save({ ...self, windows, slots: windowsToSlots(windows) });
    setAdding(false);
  };
  const setCap = (section, minutes) => save({ ...self, caps: { ...self.caps, [section]: minutes } });

  const tzDrift = policy && deviceOffset() !== policy.tzOffset;

  return (
    <>
      <TopBar title="Brick mode" back backTo="/account/settings" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] space-y-6 px-4 pb-16 pt-5 md:px-6">
          <header className="hidden md:block">
            <h1 className="text-title-1">Brick mode</h1>
          </header>
          <p className="text-callout text-fg-muted">
            Lock Mesh down to messages and calls, on your terms. Stricter limits start straight away. Anything that
            loosens them waits 24 hours, so you decide in a calm moment, not a craving one. Messages and calls are never locked.
          </p>

          {/* ---- right now ---- */}
          <section aria-labelledby="brick-now" className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${lockNow ? "bg-accent text-white" : "bg-surface-2 text-fg-muted"}`}>
                <BrickWall size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="brick-now" className="text-callout font-semibold">
                  {lockNow ? "Bricked right now" : "Not bricked right now"}
                </h2>
                <p className="text-caption text-fg-muted">
                  {lockNow
                    ? opens ? `Opens ${whenLabel(opens, now)}, in ${spanLabel(opens - now)}.` : "Locked for more than a week."
                    : nextLockLabel(policy, usage, now)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-label font-semibold uppercase tracking-wider text-fg-subtle">Brick me</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button onClick={() => setInstant(Date.now() + 2 * 3600000)}>2 hours</Button>
              <Button onClick={() => setInstant(nextMidnight(Date.now(), deviceOffset()))}>Tonight</Button>
              <Button onClick={() => setInstant(Date.now() + 3 * 86400000)}>3 days</Button>
            </div>
          </section>

          {/* ---- a loosening waiting its 24 hours ---- */}
          {policy?.pending && (
            <section role="status" className="rounded-card border border-warning-text/30 bg-warning-text/10 p-4">
              <p className="flex items-center gap-2 text-callout font-semibold text-warning-text">
                <Hourglass size={18} aria-hidden="true" /> A change is waiting
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-6 text-caption text-fg">
                {(policy.pending.tzOffset !== undefined && policy.pending.tzOffset !== policy.tzOffset
                  ? [`Switch time zone to ${utcLabel(policy.pending.tzOffset)}`]
                  : []).concat(looseningParts(policy.pending.self, self, now)).map((p) => <li key={p}>{p}</li>)}
              </ul>
              <p className="mt-2 text-caption text-fg-muted">
                Takes effect {whenLabel(due, now)}{due > now ? `, in ${spanLabel(due - now)}` : ""}. Most people who ask for a looser limit end up cancelling it.
              </p>
              <Button size="sm" className="mt-3" loading={busy}
                onClick={async () => { setBusy(true); try { await cancelPending(); toast({ title: "Change cancelled", body: "Your limits stay as they are." }); } catch { toast({ tone: "error", title: "Couldn't cancel" }); } finally { setBusy(false); } }}>
                Cancel the change
              </Button>
            </section>
          )}

          {/* ---- scheduled ---- */}
          <Group icon={CalendarClock} title="Scheduled times" help="Mesh goes to messages and calls only during these times, every week.">
            {self.windows.length === 0 ? (
              <p className="px-4 py-3 text-callout text-fg-subtle">None yet. For example: weekdays before 10am, or every night after 10pm.</p>
            ) : (
              <ul className="divide-y divide-line">
                {self.windows.map((w) => (
                  <li key={JSON.stringify(w)} className="flex min-h-14 items-center gap-3 px-4">
                    <Clock size={18} className="shrink-0 text-fg-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-callout">{windowLabel(w)}</span>
                    <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => removeWindow(w)}
                      aria-label={`Remove ${windowLabel(w)}`}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-4 py-3">
              <Button size="sm" icon={Plus} onClick={() => setAdding(true)} disabled={self.windows.length >= 21}>Add a time</Button>
            </div>
          </Group>

          {/* ---- daily caps ---- */}
          <Group icon={Timer} title="Daily limits" help="When you reach one, that section locks until midnight. Everything else stays open.">
            <ul className="divide-y divide-line">
              {SECTIONS.map((s) => {
                const cap = self.caps[s.id] || 0;
                const used = Math.floor((usage?.[s.id] || 0) / 60);
                return (
                  <li key={s.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <label htmlFor={`cap-${s.id}`} className="block text-callout font-medium text-fg">{s.label}</label>
                      <span className="block text-caption text-fg-subtle">
                        {s.blurb}{brick.cap(s.id) > 0 ? ` · ${used} of ${brick.cap(s.id)} min used today` : ""}
                      </span>
                    </span>
                    <Select id={`cap-${s.id}`} value={cap} disabled={busy} className="!w-auto"
                      onChange={(e) => setCap(s.id, Number(e.target.value))}>
                      {CAP_CHOICES.map((m) => <option key={m} value={m}>{m ? `${m} min` : "No limit"}</option>)}
                    </Select>
                  </li>
                );
              })}
            </ul>
          </Group>

          {policy && (
            <p className="flex items-start gap-2 text-caption text-fg-subtle">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Times are in {policy.tzName || "your time zone"} ({utcLabel(policy.tzOffset)}).
                {tzDrift && Math.abs(deviceOffset() - policy.tzOffset) > 60 && !policy.pending?.tzOffset && (
                  <> This device is on {utcLabel(deviceOffset())}.{" "}
                    <button type="button" className="font-semibold text-accent-text hover:underline"
                      onClick={() => requestTimeZoneChange(policy, raw).then(() => toast({ title: "Time zone change waiting", body: "It takes 24 hours, like any change that could loosen a limit." })).catch(() => toast({ tone: "error", title: "Couldn't request that" }))}>
                      Switch
                    </button> (takes 24 hours)
                  </>
                )}
                {tzDrift && Math.abs(deviceOffset() - policy.tzOffset) <= 60 && " Daylight saving is followed automatically."}
              </span>
            </p>
          )}

          <BrickedTime policy={policy} />

          <FamilySection profile={profile} policy={policy} />
        </div>
      </div>

      {adding && <AddWindowDialog onClose={() => setAdding(false)} onAdd={addWindow} />}
      {instant && (
        <ConfirmDialog tone="accent" title={`Brick Mesh until ${whenLabel(instant)}?`} confirmLabel="Brick me" busy={busy}
          body={`Feed, Flicks, Search, Circles and News lock straight away. Messages and calls still work. You can't end it early: that would be loosening, which waits 24 hours${lockNow?.reason === "instant" && lockNow.until > instant ? ". You're already bricked for longer than this, so nothing changes" : ""}.`}
          onClose={() => setInstant(null)} onConfirm={doBrick} />
      )}
      {confirm && (
        <Dialog title="This loosens your limits" variant="center" size="sm" onClose={() => setConfirm(null)}>
          <ul className="list-disc space-y-1 pl-5 text-callout text-fg">
            {confirm.parts.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="mt-3 text-callout text-fg-muted">
            So it waits 24 hours and takes effect {whenLabel(now + COOL_OFF_MS, now)}. You can cancel it any time before then.
            {policy?.pending ? " It's added to the change already waiting, and the 24 hours start again." : ""}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setConfirm(null)}>Keep my limits</Button>
            <Button variant="primary" loading={busy} onClick={queueLoosening}>Wait 24 hours</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function nextLockLabel(policy, usage, now) {
  if (!policy || !hasAnyLimit(policy.self) && !parentActive(policy, now)) return "No limits set yet.";
  // Look ahead a week for the next scheduled lock.
  for (let t = now + 30 * 60000 - (now % (30 * 60000)); t < now + 7 * 86400000; t += 30 * 60000) {
    if (lockState(policy, null, "", t)) return `Next scheduled lock: ${whenLabel(t, now)}.`;
  }
  return "No scheduled locks this week.";
}

function Group({ icon: Icon, title, help, children }) {
  const id = `g-${title.replace(/\s/g, "")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 flex items-center gap-2 px-1 text-callout font-semibold">
        <Icon size={18} className="text-fg-muted" aria-hidden="true" /> {title}
      </h2>
      {help && <p className="mb-2 px-1 text-caption text-fg-subtle">{help}</p>}
      <div className="overflow-hidden rounded-card border border-line bg-surface">{children}</div>
    </section>
  );
}

/* A weekly window: which days, from when, to when. An end at or before the
   start runs overnight ("10pm to 7am"); the same time twice means all day. */
function AddWindowDialog({ onClose, onAdd }) {
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState(22 * 60);
  const [to, setTo] = useState(7 * 60);
  const toggle = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const preset = (list) => setDays(list);
  return (
    <Dialog title="Add a scheduled time" onClose={onClose} size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!days.length} onClick={() => onAdd({ days, from, to })}>Add</Button>
        </div>
      }>
      <p className="mb-2 text-callout font-medium">Days</p>
      <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
        {DAYS.map((d, i) => (
          <button key={d} type="button" aria-pressed={days.includes(i + 1)} aria-label={DAY_NAMES[i]} onClick={() => toggle(i + 1)}
            className={`press h-10 w-11 rounded-control text-callout font-semibold ring-1 transition-colors ${
              days.includes(i + 1) ? "bg-accent text-white ring-accent" : "bg-surface-2 text-fg-muted ring-line hover:text-fg"
            }`}>
            {d}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-caption">
        <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => preset([1, 2, 3, 4, 5])}>Weekdays</button>
        <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => preset([6, 7])}>Weekends</button>
        <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => preset([1, 2, 3, 4, 5, 6, 7])}>Every day</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="From">
          <Select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {HALF_HOURS.map((m) => <option key={m} value={m}>{clockLabel(m)}</option>)}
          </Select>
        </Field>
        <Field label="To">
          <Select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {HALF_HOURS.map((m) => <option key={m} value={m}>{clockLabel(m)}</option>)}
          </Select>
        </Field>
      </div>
      <p className="mt-4 rounded-control bg-surface-2 px-3 py-2.5 text-callout" aria-live="polite">
        {days.length ? windowLabel({ days, from, to }) : "Pick at least one day."}
        {days.length > 0 && to <= from && from !== to && <span className="text-fg-subtle"> (overnight)</span>}
      </p>
    </Dialog>
  );
}

// ---------- family ----------

function FamilySection({ profile, policy }) {
  const year = new Date().getFullYear();
  const age = profile?.birthYear > 0 ? year - profile.birthYear : null;
  if (age === null) {
    return (
      <Group icon={Users} title="Parental controls" help="Set your birth year in Settings to use parental controls.">
        <p className="px-4 py-3 text-callout text-fg-subtle">Parents can add limits to an under-18 account, with the teen's agreement.</p>
      </Group>
    );
  }
  return age < 18 ? <TeenFamily profile={profile} policy={policy} /> : age >= 19 ? <ParentFamily /> : null;
}

/* The teen's side: say yes or no to a parent's invite, see the parent's
   limits, and ask for a change. Only the parent can loosen their limits. */
function TeenFamily({ profile, policy }) {
  const toast = useToast();
  const brickNow = useBrick().now;
  const [link, setLink] = useState(undefined);
  const [ask, setAsk] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  useEffect(() => { fetchMyFamilyLink().then(setLink).catch(() => setLink(null)); }, []);
  if (link === undefined) return null;

  if (!link) {
    return (
      <Group icon={ShieldCheck} title="Parental controls" help="Nobody supervises this account.">
        <p className="px-4 py-3 text-callout text-fg-subtle">A parent can ask to add limits from their own account. You'll see the request here and in Notifications.</p>
      </Group>
    );
  }

  if (link.status === "invited") {
    return (
      <Group icon={ShieldCheck} title="Parental controls">
        <div className="p-4">
          <p className="text-callout font-semibold">@{link.parentName} wants to add parental controls</p>
          <p className="mt-1 text-caption text-fg-muted">
            If you agree, @{link.parentName} can set times and daily limits on your account, and see how many minutes you spend in each section.
            Only they can loosen their limits (you can ask), until 1 January {profile.birthYear + 18}. They can't read your messages, and messages and calls are never locked.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" icon={Check} onClick={() => setConfirmAccept(true)}>Accept</Button>
            <Button onClick={async () => { await declineFamilyInvite().catch(() => {}); setLink(null); toast({ title: "Declined" }); }}>Decline</Button>
          </div>
        </div>
        {confirmAccept && (
          <ConfirmDialog tone="accent" title={`Let @${link.parentName} supervise this account?`} confirmLabel="Accept"
            body={`You won't be able to remove this yourself: you can ask @${link.parentName} to end it, and it ends on its own on 1 January ${profile.birthYear + 18}.`}
            onClose={() => setConfirmAccept(false)}
            onConfirm={async () => {
              try { await acceptFamilyInvite(link); setLink({ ...link, status: "active" }); toast({ title: `@${link.parentName} can now set limits` }); }
              catch { toast({ tone: "error", title: "Couldn't accept" }); }
              setConfirmAccept(false);
            }} />
        )}
      </Group>
    );
  }

  const par = policy?.parent;
  return (
    <Group icon={ShieldCheck} title={`Limits from @${link.parentName}`} help={`Only @${link.parentName} can loosen these. They stop on 1 January ${profile.birthYear + 18}.`}>
      <div className="p-4">
        {par ? <LayerSummary layer={par} now={brickNow} /> : <p className="text-callout text-fg-subtle">@{link.parentName} hasn't set any limits yet.</p>}
        {policy?.parentRequest ? (
          <div className="mt-4 rounded-control bg-surface-2 p-3">
            <p className="text-callout font-medium">You asked @{link.parentName} {policy.parentRequest.unlink ? "to end parental controls" : "for a change"}.</p>
            <p className="text-caption text-fg-subtle">Waiting for their answer.</p>
            <Button size="sm" className="mt-2" onClick={() => withdrawParentRequest().catch(() => {})}>Withdraw</Button>
          </div>
        ) : par && (
          <Button className="mt-4" onClick={() => setAsk(true)}>Ask for a change</Button>
        )}
      </div>
      {ask && <AskParentDialog parentName={link.parentName} layer={par} policy={policy} onClose={() => setAsk(false)} />}
    </Group>
  );
}

function AskParentDialog({ parentName, layer, policy, onClose }) {
  const toast = useToast();
  const [draft, setDraft] = useState(layer);
  const [note, setNote] = useState("");
  const [unlink, setUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await requestParentChange(policy, draft, note, unlink);
      toast({ title: `Sent to @${parentName}` });
      onClose();
    } catch { setBusy(false); toast({ tone: "error", title: "Couldn't send that" }); }
  };
  return (
    <Dialog title={`Ask @${parentName}`} onClose={onClose} size="lg"
      footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={send}>Send request</Button></div>}>
      <Checkbox checked={unlink} onChange={setUnlink} description="Instead of changing a limit.">Ask to end parental controls</Checkbox>
      {!unlink && <div className="mt-4"><LayerEditor layer={draft} onChange={setDraft} /></div>}
      <Field label="Message" optional className="mt-4" count={note.length} max={280}>
        <Textarea rows={2} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="Exams finish Friday, could I have an extra hour?" />
      </Field>
    </Dialog>
  );
}

/* The parent's side: link a teen (who has to agree), then set limits that
   take effect at once, and answer the teen's requests. */
function ParentFamily() {
  const toast = useToast();
  const [teens, setTeens] = useState(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => fetchMyTeens().then(setTeens).catch(() => setTeens([]));
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const teen = await inviteTeen(handle.trim().replace(/^@/, "").toLowerCase());
      toast({ title: `Asked @${teen.username}`, body: "They'll see it in Notifications and need to agree." });
      setHandle("");
      load();
    } catch (err) {
      setError(err?.code === "permission-denied" ? "That account can't be linked. It may already have a parent linked, or have blocked you." : err.message);
    } finally { setBusy(false); }
  };

  return (
    <Group icon={Users} title="Parental controls" help="Add limits to your teen's account. They have to agree, and the limits end on 1 January of the year they turn 18.">
      <form onSubmit={invite} className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="teen-handle" className="sr-only">Your teen's handle</label>
          <Input id="teen-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@their_handle" autoComplete="off"
            aria-invalid={error ? "true" : undefined} aria-describedby="teen-error" />
          <div id="teen-error" aria-live="polite" className="mt-1"><InlineMessage>{error}</InlineMessage></div>
        </div>
        <Button type="submit" icon={UserPlus} loading={busy} disabled={handle.trim().length < 3}>Invite</Button>
      </form>
      {teens?.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {teens.map((t) => (
            <li key={t.id} className="flex min-h-14 items-center gap-3 px-4">
              <span className="min-w-0 flex-1 text-callout">@{t.childName}</span>
              {t.status === "invited" ? <Badge tone="warning">Waiting for them</Badge> : <Badge tone="success">Linked</Badge>}
              {t.status === "active"
                ? <Button size="sm" onClick={() => setOpen(t)}>Manage</Button>
                : <Button size="sm" variant="ghost" onClick={() => removeFamilyLink(t.id).then(load)}>Cancel</Button>}
            </li>
          ))}
        </ul>
      )}
      {open && <TeenDialog link={open} onClose={() => { setOpen(null); load(); }} />}
    </Group>
  );
}

function TeenDialog({ link, onClose }) {
  const toast = useToast();
  const [child, setChild] = useState(null);
  const [lock, setLock] = useState({ policy: undefined });
  const [usage, setUsage] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => { fetchProfile(link.id).then(setChild).catch(() => {}); }, [link.id]);
  useEffect(() => listenLock(link.id, (policy) => setLock({ policy })), [link.id]);
  useEffect(() => { if (lock.policy) fetchUsageFor(link.id, lock.policy.tzOffset).then(setUsage); }, [link.id, lock.policy]);
  const policy = lock.policy;
  const layer = policy?.parent || emptyLayer();

  const save = async (next) => {
    if (!child) return;
    setBusy(true);
    try { await saveParentLimits(child, policy, next); toast({ title: "Saved", body: "It applies straight away." }); }
    catch { toast({ tone: "error", title: "Couldn't save" }); }
    finally { setBusy(false); }
  };
  const answer = async (approve) => {
    setBusy(true);
    try {
      await answerParentRequest(child, policy, approve);
      deleteNotices([`familyask_${link.id}`]).catch(() => {});
      toast({ title: approve ? "Approved" : "Declined" });
      if (approve && policy.parentRequest.unlink) onClose();
    } catch { toast({ tone: "error", title: "Couldn't answer that" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog title={`@${link.childName}`} onClose={onClose} size="lg">
      {policy === undefined || !child ? <p className="text-callout text-fg-subtle">Loading…</p> : (
        <>
          <p className="mb-4 text-caption text-fg-muted">
            Your limits apply straight away and only you can loosen them. They end on 1 January {child.birthYear + 18}.
            Today: {SECTIONS.map((s) => `${Math.floor((usage[s.id] || 0) / 60)} min ${s.label}`).join(", ")}.
          </p>
          {policy?.parentRequest && (
            <div className="mb-5 rounded-card border border-accent-text/30 bg-accent-soft p-4">
              <p className="text-callout font-semibold">@{link.childName} asked {policy.parentRequest.unlink ? "you to end parental controls" : "for a change"}</p>
              {policy.parentRequest.note && <p className="mt-1 text-callout">“{policy.parentRequest.note}”</p>}
              {!policy.parentRequest.unlink && (
                <ul className="mt-2 list-disc pl-5 text-caption text-fg-muted">
                  {(looseningParts(policy.parentRequest.self, layer).length ? looseningParts(policy.parentRequest.self, layer) : ["Stricter or the same"]).map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" loading={busy} onClick={() => answer(true)}>Approve</Button>
                <Button size="sm" disabled={busy} onClick={() => answer(false)}>Decline</Button>
              </div>
            </div>
          )}
          <InstantRow disabled={busy} onBrick={(until) => save({ ...layer, until: Math.max(layer.until || 0, until) })} />
          <div className="mt-5"><LayerEditor layer={layer} onChange={save} disabled={busy} /></div>
          <div className="mt-6 border-t border-line pt-4">
            <Button variant="danger-ghost" onClick={() => setConfirmRemove(true)}>Remove parental controls</Button>
          </div>
          {confirmRemove && (
            <ConfirmDialog title={`Stop supervising @${link.childName}?`} confirmLabel="Remove"
              body="Your limits come off straight away. Their own limits, if they set any, stay."
              onClose={() => setConfirmRemove(false)}
              onConfirm={async () => { await removeFamilyLink(link.id).catch(() => {}); onClose(); }} />
          )}
        </>
      )}
    </Dialog>
  );
}

function InstantRow({ onBrick, disabled }) {
  return (
    <div>
      <p className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Brick now</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button size="sm" disabled={disabled} onClick={() => onBrick(Date.now() + 2 * 3600000)}>2 hours</Button>
        <Button size="sm" disabled={disabled} onClick={() => onBrick(nextMidnight(Date.now(), deviceOffset()))}>Tonight</Button>
        <Button size="sm" disabled={disabled} onClick={() => onBrick(Date.now() + 3 * 86400000)}>3 days</Button>
      </div>
    </div>
  );
}

/** Windows and caps, for a parent's layer or a teen's request. */
function LayerEditor({ layer, onChange, disabled }) {
  const [adding, setAdding] = useState(false);
  const setWindows = (windows) => onChange({ ...layer, windows, slots: windowsToSlots(windows) });
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-callout font-semibold">Scheduled times</p>
        {layer.windows.length === 0 && <p className="text-caption text-fg-subtle">None.</p>}
        <ul className="space-y-1">
          {layer.windows.map((w) => (
            <li key={JSON.stringify(w)} className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-callout">
              <span className="flex-1">{windowLabel(w)}</span>
              <button type="button" disabled={disabled} aria-label={`Remove ${windowLabel(w)}`} onClick={() => setWindows(layer.windows.filter((x) => x !== w))}
                className="press rounded-full p-1 text-fg-subtle hover:text-fg"><X size={16} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
        <Button size="sm" icon={Plus} className="mt-2" disabled={disabled} onClick={() => setAdding(true)}>Add a time</Button>
      </div>
      <div>
        <p className="mb-1.5 text-callout font-semibold">Daily limits</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {SECTIONS.map((s) => (
            <Field key={s.id} label={s.label}>
              <Select value={layer.caps[s.id] || 0} disabled={disabled} onChange={(e) => onChange({ ...layer, caps: { ...layer.caps, [s.id]: Number(e.target.value) } })}>
                {CAP_CHOICES.map((m) => <option key={m} value={m}>{m ? `${m} min` : "No limit"}</option>)}
              </Select>
            </Field>
          ))}
        </div>
      </div>
      {adding && <AddWindowDialog onClose={() => setAdding(false)} onAdd={(w) => { setWindows([...layer.windows, w]); setAdding(false); }} />}
    </div>
  );
}

function LayerSummary({ layer, now }) {
  const caps = SECTIONS.filter((s) => layer.caps[s.id] > 0).map((s) => `${s.label} ${layer.caps[s.id]} min a day`);
  return (
    <ul className="space-y-1 text-callout">
      {layer.until > now && <li>Bricked until {whenLabel(layer.until, now)}</li>}
      {layer.windows.map((w) => <li key={JSON.stringify(w)}>{windowLabel(w)}</li>)}
      {caps.map((c) => <li key={c}>{c}</li>)}
      {!layer.windows.length && !caps.length && !(layer.until > now) && <li className="text-fg-subtle">No limits set.</li>}
    </ul>
  );
}

/* What you've got to show for it: time bricked this week and in total, and
   a streak of days, counted only from bricks the server enforced. Private
   until you choose to show it on your profile and the leaderboard. */
function BrickedTime({ policy }) {
  const toast = useToast();
  const { openComposer } = useShell();
  const [stats, setStats] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [week] = useState(() => weekKeyFor(Date.now(), policy?.tzOffset ?? deviceOffset()));
  useEffect(() => { fetchBrickStats().then(setStats).catch(() => setStats(null)); }, [policy?.self?.until]);
  if (!policy || stats === undefined) return null;
  const thisWeek = stats && stats.weekKey === week ? stats.weekSeconds : 0;

  const toggle = async (on) => {
    setBusy(true);
    try {
      await setStatsPublic(policy, on);
      setStats((s) => ({ ...s, public: on }));
      toast({ title: on ? "Showing your bricked time" : "Your bricked time is private again",
        body: on ? "It's on your profile and the leaderboard." : undefined });
    } catch { toast({ tone: "error", title: "Couldn't change that" }); }
    finally { setBusy(false); }
  };

  return (
    <Group icon={Trophy} title="Bricked time" help="Counted from bricks Mesh enforced: finished instant bricks and whole days of scheduled time.">
      {!stats ? (
        <p className="px-4 py-3 text-callout text-fg-subtle">Counting starts today.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 divide-x divide-line">
            {[["This week", durationLabel(thisWeek)], ["In total", durationLabel(stats.totalSeconds)], ["Streak", stats.streakDays ? `${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}` : "None yet"]].map(([k, v]) => (
              <div key={k} className="px-3 py-3 text-center">
                <dt className="text-label font-semibold uppercase tracking-wider text-fg-subtle">{k}</dt>
                <dd className="mt-1 text-title-3 tabular">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-start gap-3 border-t border-line px-4 py-3">
            <span className="min-w-0 flex-1">
              <label htmlFor="stats-public" className="block text-callout font-medium text-fg">Show on my profile and the leaderboard</label>
              <span className="mt-0.5 block text-caption text-fg-subtle">Only your bricked time, never your limits or what you use.</span>
            </span>
            <Switch id="stats-public" checked={!!stats.public} disabled={busy} onChange={toggle} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            <Button size="sm" icon={Trophy} onClick={() => navigate("/leaderboard")}>Leaderboard</Button>
            {stats.totalSeconds > 0 && (
              <Button size="sm" icon={Share2} onClick={() => openComposer({
                kind: "text",
                text: `I've kept Mesh bricked for ${durationLabel(thisWeek || stats.totalSeconds)} ${thisWeek ? "this week" : "so far"}${stats.streakDays > 1 ? `, ${stats.streakDays} days in a row` : ""}. #brickmode`,
              })}>Share</Button>
            )}
            {stats.streakDays > 1 && <span className="inline-flex items-center gap-1 text-caption text-fg-subtle"><Flame size={14} aria-hidden="true" /> Keep the streak going</span>}
          </div>
        </>
      )}
    </Group>
  );
}
