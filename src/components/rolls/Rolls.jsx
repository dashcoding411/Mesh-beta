import { useCallback, useEffect, useState } from "react";
import { Aperture, ChevronRight, ClipboardPaste, Plus, ScanQrCode } from "lucide-react";
import {
  createRoll, developChoices, developLabel, countdownLabel, fetchMyRolls, isDeveloped, rollIdFromLink, rollSeen, SHOTS_PER_PERSON, tsMillis,
} from "../../lib/db";
import { authPath, navigate } from "../../lib/router";
import { checkName } from "../../lib/moderation";
import { useShell } from "../shell/ShellContext";
import HomeHeader from "../shell/HomeHeader";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Dialog from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import SevenSeg from "./SevenSeg";
import HelpLink from "../ui/HelpLink";
import RollPage from "./RollPage";
import RollScanner from "./RollScanner";

/** Rolls: your shared disposable cameras, or one roll at /rolls/:id. Phones only. */
export default function Rolls({ rollId }) {
  const desktop = useDesktop();
  if (desktop) return <PhoneOnly />;
  if (rollId) return <RollPage key={rollId} rollId={rollId} />;
  return <RollsHome />;
}

// A computer is a mouse or trackpad that can hover, whatever the window's
// size. Screen width would be wrong: a phone turned sideways is wider than
// many laptops' breakpoint, and must stay in the camera.
const COMPUTER = "(hover: hover) and (pointer: fine)";
function useDesktop() {
  const [computer, setComputer] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(COMPUTER).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPUTER);
    if (!mq) return undefined;
    const on = () => setComputer(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return computer;
}

// Rolls are a camera you carry, so on a computer they point you to your phone.
function PhoneOnly() {
  const [qr, setQr] = useState("");
  const url = window.location.href;
  useEffect(() => {
    let live = true;
    import("qrcode").then((m) => (m.default || m).toDataURL(url, { margin: 1, width: 440, color: { dark: "#111114", light: "#ffffff" } }))
      .then((d) => { if (live) setQr(d); }).catch(() => {});
    return () => { live = false; };
  }, [url]);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#111114] text-[#ff9b2f]"><Aperture size={26} aria-hidden="true" /></span>
        <h1 className="mt-4 font-display text-title-1">Rolls live on your phone</h1>
        <p className="mt-2 text-body text-fg-muted">
          A roll is a camera you carry. Scan this with your phone to open it there, or tap the camera button at the top of Home in Mesh on your phone.
        </p>
        <div className="mx-auto mt-6 w-56 rounded-card bg-white p-3">
          {qr ? <img src={qr} alt="QR code to open this page on your phone" className="block w-full" /> : <span className="block aspect-square w-full" />}
        </div>
      </div>
    </div>
  );
}

function RollsHome() {
  const { guest, needsAccount } = useShell();
  const [rolls, setRolls] = useState(guest ? [] : null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");

  const load = useCallback(async () => {
    if (guest) return;
    try { setRolls(await fetchMyRolls()); setError(false); } catch { setError(true); }
  }, [guest]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const start = () => { if (!needsAccount("start a roll")) setCreating(true); };
  const [now] = useState(() => Date.now());
  const live = (rolls || []).filter((r) => !isDeveloped(r, now));
  const done = (rolls || []).filter((r) => isDeveloped(r, now));

  return (
    <>
      <HomeHeader section="rolls"
        actions={<Button size="sm" variant="primary" icon={Plus} className="hidden md:inline-flex" onClick={start}>Start a roll</Button>} />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-4 md:px-6">
          <Intro onStart={start} compact={!!rolls?.length} guest={guest} />
          {!guest && <JoinRoll />}
          {error && <ErrorState title="Couldn't load your rolls" onRetry={() => { setError(false); setRolls(null); load(); }} />}
          {!error && rolls === null && <div className="mt-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 !rounded-card" />)}</div>}
          {live.length > 0 && (
            <section aria-labelledby="rolls-live" className="mt-8">
              <h2 id="rolls-live" className="mb-3 text-title-3">Shooting now</h2>
              <ul className="space-y-3">{live.map((r) => <li key={r.id}><RollCard roll={r} now={now} /></li>)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="rolls-done" className="mt-8">
              <h2 id="rolls-done" className="mb-3 text-title-3">Developed</h2>
              <ul className="space-y-3">{done.map((r) => <li key={r.id}><RollCard roll={r} now={now} /></li>)}</ul>
            </section>
          )}
          {rolls?.length === 0 && !guest && (
            <EmptyState compact icon={Aperture} title="No rolls yet" body="Start one for tonight, then send the link to whoever's coming." />
          )}

        </div>
      </div>
      {creating && <NewRollDialog onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); navigate(`/rolls/${r.id}?invite=1`); }} />}
    </>
  );
}

// Joining a friend's roll from inside Mesh, where you're signed in: scan the
// QR code on their phone, or paste a link. (A link tapped elsewhere opens in
// Safari or that app, which may not be signed in.)
function JoinRoll() {
  const [scanning, setScanning] = useState(false);
  const closeScanner = useCallback(() => setScanning(false), []);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const open = (value) => {
    const id = rollIdFromLink(value);
    if (id) { navigate(`/rolls/${encodeURIComponent(id)}`); return true; }
    return false;
  };
  const paste = async () => {
    let clip = "";
    try { clip = await navigator.clipboard.readText(); } catch { /* not allowed: type or paste it instead */ }
    if (open(clip)) return;
    setText(clip);
    setError("");
    setAsking(true);
  };
  const submit = (e) => {
    e.preventDefault();
    if (!open(text)) setError("That isn't a roll link. It looks like joinmesh.social/rolls/ and then some letters and numbers.");
  };
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button icon={ScanQrCode} onClick={() => setScanning(true)}>Scan QR code</Button>
        <Button icon={ClipboardPaste} onClick={paste}>Paste link</Button>
      </div>
      {scanning && <RollScanner onClose={closeScanner} />}
      {asking && (
        <Dialog title="Open a roll from its link" onClose={() => setAsking(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Invite link" error={error}>
              <Input value={text} onChange={(e) => { setText(e.target.value); setError(""); }} placeholder="joinmesh.social/rolls/…" autoFocus inputMode="url" />
            </Field>
            <Button type="submit" variant="primary" full>Open the roll</Button>
          </form>
        </Dialog>
      )}
    </>
  );
}

// What Rolls are, with a little contact sheet. Smaller once you have some.
function Intro({ onStart, compact, guest }) {
  if (compact) {
    return (
      <Button variant="primary" icon={Plus} full className="md:hidden" onClick={onStart}>Start a roll</Button>
    );
  }
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="grid grid-cols-3 gap-1.5 bg-[#111114] p-3" aria-hidden="true">
        {["from-amber-500 via-rose-500 to-fuchsia-700", "from-sky-500 via-indigo-600 to-violet-800", "from-emerald-400 via-teal-600 to-slate-800"].map((g, i) => (
          <div key={g} className={`relative aspect-[3/4] overflow-hidden rounded-[6px] bg-gradient-to-br ${g}`}>
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,.35),transparent_60%)]" />
            <span className="absolute bottom-1.5 right-1.5"><SevenSeg text={["02 11 '26", "14 02 '27", "17 02 '27"][i]} height={7} color="#ff9b2f" glow /></span>
          </div>
        ))}
      </div>
      <div className="p-5">
        <h2 className="font-display text-title-1">Everyone shoots. Nobody looks.</h2>
        <p className="mt-2 text-body text-fg-muted">
          A roll is a shared disposable camera for a night out, a trip or a gathering. Everyone gets {SHOTS_PER_PERSON} shots and no previews.
          At 9am the next morning it develops, and everyone gets every photo at once.
        </p>
        <ol className="mt-4 space-y-1.5 text-callout text-fg-muted">
          <li><span className="font-semibold text-fg">1.</span> Start a roll and send the link</li>
          <li><span className="font-semibold text-fg">2.</span> Shoot all night, with the camera only</li>
          <li><span className="font-semibold text-fg">3.</span> Wake up to everyone's photos</li>
        </ol>
        <div className="mt-2"><HelpLink guide="rolls">More about Rolls</HelpLink></div>
        <Button variant="primary" icon={guest ? undefined : Plus} className="mt-5" onClick={guest ? () => navigate(authPath("signup")) : onStart}>
          {guest ? "Sign up to start a roll" : "Start a roll"}
        </Button>
      </div>
    </section>
  );
}

function RollCard({ roll, now }) {
  const developed = isDeveloped(roll, now);
  const at = tsMillis(roll.developAt);
  const fresh = developed && !rollSeen(roll.id);
  return (
    <button type="button" onClick={() => navigate(`/rolls/${roll.id}`)}
      className="press flex w-full items-center gap-4 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong">
      <span aria-hidden="true" className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-control ${developed ? "bg-accent-soft text-accent-text" : "bg-[#111114] text-[#ff9b2f]"}`}>
        {developed ? <Aperture size={26} /> : <SevenSeg text={String(roll.photoCount || 0).padStart(2, "0").slice(-3)} height={18} color="#ff9b2f" glow />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-title-3">{roll.title}</span>
          {fresh && <Badge tone="accent">New</Badge>}
        </span>
        <span className="mt-0.5 block text-caption text-fg-muted">
          {developed
            ? `Developed ${developLabel(at, now).replace(/ at .*/, "")} · ${roll.photoCount || 0} shots`
            : `Develops in ${countdownLabel(at, now)} · ${roll.photoCount || 0} shots so far`}
        </span>
        <span className="block text-caption text-fg-subtle">{(roll.members || []).length} {(roll.members || []).length === 1 ? "person" : "people"} · started by @{roll.ownerName}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
    </button>
  );
}

export function NewRollDialog({ onClose, onCreated, initialTitle = "" }) {
  const [now] = useState(() => Date.now());
  const choices = developChoices(now);
  const [title, setTitle] = useState(initialTitle);
  const [developAt, setDevelopAt] = useState(choices[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = title.trim();
    if (!name) return setError("Give it a name, like \"Sam's 21st\".");
    if (checkName(name).error) return setError(checkName(name).error);
    setBusy(true);
    setError("");
    try { onCreated(await createRoll({ title: name, developAt })); }
    catch (err) {
      setError(err?.code === "permission-denied" ? "That wasn't accepted. Try another name." : "Couldn't start the roll. Check your connection.");
      setBusy(false);
    }
  };

  return (
    <Dialog title="Start a roll" onClose={onClose} size="sm"
      footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" form="new-roll" variant="primary" loading={busy}>Start the roll</Button></div>}>
      <form id="new-roll" onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" count={title.length} max={60} error={error}>
          <Input value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); setError(""); }} placeholder="Sam's 21st" autoFocus />
        </Field>
        <fieldset>
          <legend className="mb-2 text-callout font-medium">Develops</legend>
          <div role="radiogroup" aria-label="When it develops" className="grid grid-cols-2 gap-2">
            {choices.map((ms, i) => (
              <button key={ms} type="button" role="radio" aria-checked={developAt === ms} onClick={() => setDevelopAt(ms)}
                className={`press min-h-12 rounded-control border px-3 text-left text-callout ${developAt === ms ? "border-accent bg-accent-soft font-semibold text-fg" : "border-field bg-surface-2 text-fg-muted"}`}>
                {i === 3 ? `In a week, ${developLabel(ms, now).replace(/^(\w+)/, (d) => d.slice(0, 3))}` : developLabel(ms, now).replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
          <p className="mt-2 text-caption text-fg-subtle">
            Everyone gets {SHOTS_PER_PERSON} shots until then. Nobody can see any photo before it develops, you included.
          </p>
        </fieldset>
      </form>
    </Dialog>
  );
}
