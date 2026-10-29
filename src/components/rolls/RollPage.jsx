import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture, ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Lock, LogOut, MoreHorizontal,
  Pencil, QrCode, Share2, Sunrise, Trash2, UserMinus, Users, X, Bell,
} from "lucide-react";
import {
  fetchRoll, fetchMyShotCount, fetchRollPhotos, fetchProfiles, joinRoll, leaveRoll, removeFromRoll, updateRoll, deleteRoll,
  deleteRollPhoto, isDeveloped, isMember, developLabel, countdownLabel, rollUrl, rollIcs, rollGoogleCalendarUrl, markRollSeen,
  rollSeen, onShotQueue, SHOTS_PER_PERSON, MAX_MEMBERS, tsMillis, me, openUserProfile, developRollNow, onTeam,
  rollPhotoFile, pickedRollFiles, MAX_SLIDES,
} from "../../lib/db";
import { OthersNote, PickablePhotos } from "./RollPicker";
import { authPath, goBack, navigate } from "../../lib/router";
import { motionReduced } from "../../lib/appearance";
import { checkName } from "../../lib/moderation";
import { useShell } from "../shell/ShellContext";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import Avatar from "../ui/Avatar";
import MediaImg from "../ui/MediaImg";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { MenuItem } from "../ui/Menu";
import { Field, Input } from "../ui/Field";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";
import { usePageTitle } from "../../lib/usePageTitle";
import { enablePush, pushState, remind } from "../../lib/push";
import InstallDialog from "../InstallDialog";
import { isIOS, isStandalone } from "../../lib/install";
import RollCamera from "./RollCamera";
import SevenSeg from "./SevenSeg";
import { siteOrigin } from "../../lib/native";

export default function RollPage({ rollId }) {
  const { guest } = useShell();
  const [roll, setRoll] = useState(undefined);
  const [now, setNow] = useState(() => Date.now());
  usePageTitle(roll?.title || "Roll", 1);

  // After loading, "now" is at least the develop time, so a roll developed early opens straight away.
  const load = useCallback(() => fetchRoll(rollId).then((r) => {
    setNow((n) => Math.max(n, Date.now(), r && tsMillis(r.developAt) <= Date.now() + 5000 ? tsMillis(r.developAt) : 0));
    setRoll(r);
  }).catch(() => setRoll(null)), [rollId]);
  useEffect(() => { if (!guest) load(); }, [guest, load]);
  // Tick, so a roll developing while you're looking at it opens up.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  if (guest) return <GuestInvite />;
  if (roll === undefined) return <Frame><div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 !rounded-card" /></div></Frame>;
  if (roll === null) {
    return <Frame><EmptyState icon={Aperture} title="This roll isn't here" body="It may have been deleted, or the link is wrong." action={<Button onClick={() => navigate("/rolls")}>Your rolls</Button>} /></Frame>;
  }
  const member = isMember(roll);
  const developed = isDeveloped(roll, now);
  if (!member) return <Invite roll={roll} developed={developed} onJoined={load} />;
  return developed
    ? <Developed roll={roll} onChange={setRoll} />
    : <Shooting roll={roll} now={now} onChange={setRoll} reload={load} />;
}

function Frame({ children, title, right }) {
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur glass-solid">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/rolls")} />
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{title || "Roll"}</p>
        {right}
      </header>
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 md:px-6">{children}</div>
    </div>
  );
}

// Apps that open links in their own browser, which keeps its own sign-in.
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|Messenger|Snapchat|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Twitter|Line\//i;

function GuestInvite() {
  const toast = useToast();
  // Links never open in Mesh on an iPhone's home screen (M.A.T.H): they open
  // in Safari, or inside the app they were tapped in, each signed in (or not)
  // on its own. So someone already on Mesh can land here signed out.
  const why = IN_APP_BROWSER.test(navigator.userAgent)
    ? "This link opened inside another app's browser, which doesn't know you're signed in to Mesh. Copy the link and open it in Mesh, or in Safari or Chrome where you're signed in."
    : isIOS() && !isStandalone()
      ? "Links open in Safari, which signs in separately from Mesh on your home screen. Open Mesh from your home screen and tap Scan QR code in Rolls, or copy this link and tap Paste link there. Or log in here."
      : "You're not signed in on this browser. Log in, or copy the link and open it where you use Mesh.";
  const copy = async () => {
    try { await navigator.clipboard.writeText(siteOrigin() + window.location.pathname); toast({ title: "Link copied" }); }
    catch { toast({ tone: "error", title: "Couldn't copy", body: "Copy it from the address bar instead." }); }
  };
  return (
    <Frame title="You're invited to a roll">
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#111114] text-[#ff9b2f]"><Aperture size={30} aria-hidden="true" /></span>
        <h1 className="mt-4 font-display text-title-1">You're invited to a roll</h1>
        <p className="mx-auto mt-2 max-w-md text-body text-fg-muted">
          A roll is a shared disposable camera. Everyone gets {SHOTS_PER_PERSON} shots, nobody sees a thing until it develops, then everyone gets every photo at once. Join Mesh to add your shots and see everyone's.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => navigate(authPath("signup"))}>Sign up to join</Button>
          <Button onClick={() => navigate(authPath("login"))}>Log in</Button>
        </div>
        <section aria-labelledby="have-mesh" className="mx-auto mt-8 max-w-md rounded-card border border-line bg-surface p-4 text-left">
          <h2 id="have-mesh" className="text-callout font-semibold">Already on Mesh?</h2>
          <p className="mt-1 text-callout text-fg-muted">{why}</p>
          <Button className="mt-3" icon={Copy} onClick={copy}>Copy invite link</Button>
        </section>
      </div>
    </Frame>
  );
}

function Invite({ roll, developed, onJoined }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const full = (roll.members || []).length >= MAX_MEMBERS;
  const join = async () => {
    setBusy(true);
    try { await joinRoll(roll); await onJoined(); toast({ title: "You're in", body: `You've got ${SHOTS_PER_PERSON} shots.` }); }
    catch { toast({ tone: "error", title: "Couldn't join", body: "Joining may have just closed." }); setBusy(false); }
  };
  const why = developed ? "This roll has developed. Only people who joined before then can see it."
    : !roll.open ? "Joining is closed for this roll. Ask whoever started it to open it again."
      : full ? `This roll is full (${MAX_MEMBERS} people).` : "";
  return (
    <Frame title={roll.title}>
      <div className="text-center">
        <RollStamp roll={roll} />
        <p className="mt-5 text-caption font-semibold uppercase tracking-wider text-fg-subtle">@{roll.ownerName}'s roll</p>
        <h1 className="mt-1 font-display text-title-1">{roll.title}</h1>
        <p className="mt-2 text-body text-fg-muted">
          {(roll.members || []).length} {(roll.members || []).length === 1 ? "person" : "people"} · {roll.photoCount || 0} shots so far ·
          {developed ? " developed" : ` develops ${developLabel(tsMillis(roll.developAt))}`}
        </p>
        {why ? (
          <p className="mx-auto mt-6 flex max-w-sm items-start gap-2 rounded-card border border-line bg-surface p-4 text-left text-callout text-fg-muted">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {why}
          </p>
        ) : (
          <>
            <Button variant="primary" size="lg" className="mt-6" loading={busy} onClick={join}>Join and get {SHOTS_PER_PERSON} shots</Button>
            <p className="mx-auto mt-3 max-w-sm text-caption text-fg-subtle">
              Nobody sees the photos until it develops, you included.
            </p>
          </>
        )}
      </div>
    </Frame>
  );
}

// The roll's name and develop time on a little film canister.
function RollStamp({ roll }) {
  return (
    <span className="mx-auto inline-flex flex-col items-center gap-2 rounded-card bg-[#111114] px-6 py-4 text-white" aria-hidden="true">
      <Aperture size={30} className="text-[#ff9b2f]" />
      <SevenSeg text={String(roll.photoCount || 0).padStart(3, "0")} height={26} color="#ff9b2f" glow />
      <span className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/60">shots</span>
    </span>
  );
}

function Shooting({ roll, now, onChange, reload }) {
  const toast = useToast();
  const [used, setUsed] = useState(null);
  const [camera, setCamera] = useState(false);
  const [dialog, setDialog] = useState(() => (new URLSearchParams(window.location.search).get("invite") === "1" ? "invite" : null));
  const [queue, setQueue] = useState({ saving: 0 });
  const [people, setPeople] = useState(new Map());
  const owner = roll.ownerId === me();
  const at = tsMillis(roll.developAt);
  const left = used === null ? null : Math.max(0, SHOTS_PER_PERSON - used);

  useEffect(() => { fetchMyShotCount(roll.id).then(setUsed).catch(() => setUsed(0)); }, [roll.id]);
  useEffect(() => onShotQueue(setQueue), []);
  // With notifications on, make sure this roll will tell you when it develops.
  useEffect(() => { remind("roll", roll.id).catch(() => {}); }, [roll.id]);
  useEffect(() => { fetchProfiles(roll.members || []).then(setPeople).catch(() => {}); }, [roll.members]);
  // Refresh the shot total now and then while it's open and on screen.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 60000);
    return () => clearInterval(t);
  }, [reload]);

  const closeCamera = () => {
    setCamera(false);
    reload();
    if (queue.saving > 0) toast({ title: "Still saving your shots", body: "Keep Mesh open for a moment." });
  };

  return (
    <Frame title={roll.title} right={<RollMenu roll={roll} owner={owner} onChange={onChange} onDialog={setDialog} />}>
      <div className="text-center">
        <p className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Develops {developLabel(at, now)}</p>
        <h1 className="mt-1 font-display text-title-1">{roll.title}</h1>
        <p className="mt-1 text-callout text-fg-muted">in {countdownLabel(at, now)}</p>
      </div>

      <div className="mt-6 rounded-card bg-[#111114] p-5 text-white">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/60">Your shots left</p>
            <div className="mt-2">{left === null ? <span className="block h-[34px]" /> : <SevenSeg text={String(left).padStart(2, "0")} height={34} color="#ffffff" />}</div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/60">Everyone</p>
            <div className="mt-2 flex justify-end"><SevenSeg text={String(roll.photoCount || 0).padStart(3, "0")} height={22} color="#ff9b2f" glow /></div>
          </div>
        </div>
        {/* One frame per shot, like the counter window on a disposable. */}
        <div className="mt-4 flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: SHOTS_PER_PERSON }, (_, i) => (
            <span key={i} className={`h-3 flex-1 rounded-[2px] ${used !== null && i < used ? "bg-[#ff9b2f]" : "bg-white/15"}`} />
          ))}
        </div>
        <Button variant="primary" size="lg" full className="mt-5 !bg-white !text-black hover:!bg-white/90" icon={Aperture}
          disabled={left === 0} onClick={() => setCamera(true)}>
          {left === 0 ? "You've used all 27" : "Shoot"}
        </Button>
        {queue.saving > 0 && <p className="mt-2 text-center text-caption text-white/70" role="status">Saving {queue.saving} {queue.saving === 1 ? "shot" : "shots"}…</p>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button icon={Share2} onClick={() => setDialog("invite")}>Invite people</Button>
        <Button icon={CalendarPlus} onClick={() => setDialog("remind")}>Remind me at 9</Button>
      </div>

      <section aria-labelledby="roll-people" className="mt-8">
        <h2 id="roll-people" className="mb-3 flex items-center gap-2 text-title-3"><Users size={18} aria-hidden="true" /> In this roll · {(roll.members || []).length}</h2>
        <ul className="flex flex-wrap gap-2">
          {(roll.members || []).map((uid) => {
            const p = people.get(uid);
            return (
              <li key={uid}>
                <button type="button" onClick={() => openUserProfile(uid)} className="press inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-caption font-medium hover:bg-surface-3">
                  <Avatar profile={p || { username: "?" }} size={28} />
                  {uid === me() ? "You" : p ? `@${p.username}` : "Someone"}
                  {uid === roll.ownerId && <span className="text-accent-text">· started it</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {!roll.open && <p className="mt-3 text-caption text-fg-subtle">Joining is closed.</p>}
        {roll.gatheringId && (
          <button type="button" onClick={() => navigate(`/gatherings/${roll.gatheringId}`)} className="mt-4 text-callout font-semibold text-accent-text hover:underline">
            Open the gathering
          </button>
        )}
      </section>

      {camera && left !== null && (
        <RollCamera roll={roll} used={used} onClose={closeCamera} onShot={(d) => setUsed((n) => Math.max(0, (n || 0) + d))} />
      )}
      {dialog === "invite" && <InviteDialog roll={roll} onClose={() => setDialog(null)} />}
      {dialog === "remind" && <RemindDialog roll={roll} onClose={() => setDialog(null)} />}
      <ManageDialogs roll={roll} dialog={dialog} onDialog={setDialog} onChange={onChange} people={people} onDeveloped={reload} />
    </Frame>
  );
}

function RollMenu({ roll, owner, onChange, onDialog }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState(false);
  useEffect(() => { onTeam("content").then(setStaff).catch(() => {}); }, []);
  const developed = isDeveloped(roll);
  const pick = (d) => { setOpen(false); onDialog(d); };
  return (
    <>
      <IconButton icon={MoreHorizontal} label="Roll options" onClick={() => setOpen(true)} />
      {open && (
        <Dialog title="Roll options" onClose={() => setOpen(false)} size="sm">
          <div className="space-y-0.5">
            {(owner || staff) && !developed && (
              <MenuItem icon={Sunrise} onClick={() => pick("develop")}
                description={owner ? "Shooting ends and everyone gets every photo right away" : "Mesh staff, for testing: develops it for everyone right away"}>
                {owner ? "Develop now" : "Develop now (staff)"}
              </MenuItem>
            )}
            {owner && !developed && <MenuItem icon={Pencil} onClick={() => pick("rename")}>Rename</MenuItem>}
            {owner && !developed && (
              <MenuItem icon={Lock} description={roll.open ? "Nobody new can join with the link" : "Anyone with the link can join again"} onClick={async () => {
                setOpen(false);
                try { await updateRoll(roll, { open: !roll.open }); onChange({ ...roll, open: !roll.open }); toast({ title: roll.open ? "Joining closed" : "Joining open" }); }
                catch { toast({ tone: "error", title: "Couldn't change that" }); }
              }}>{roll.open ? "Close joining" : "Open joining"}</MenuItem>
            )}
            {owner && <MenuItem icon={UserMinus} onClick={() => pick("people")}>Remove people</MenuItem>}
            {owner && <MenuItem icon={Trash2} danger onClick={() => pick("delete")}>Delete roll</MenuItem>}
            {!owner && <MenuItem icon={LogOut} danger onClick={() => pick("leave")}>Leave roll</MenuItem>}
          </div>
        </Dialog>
      )}
    </>
  );
}

function ManageDialogs({ roll, dialog, onDialog, onChange, people, onDeveloped }) {
  const toast = useToast();
  const [name, setName] = useState(roll.title);
  const [error, setError] = useState("");
  if (dialog === "develop") {
    return (
      <ConfirmDialog title="Develop it now?" confirmLabel="Develop now" onClose={() => onDialog(null)}
        body="Shooting ends and everyone in the roll gets every photo right away, instead of at the develop time. This can't be undone."
        onConfirm={async () => {
          try { await developRollNow(roll); onDialog(null); await onDeveloped?.(); toast({ title: "Developed" }); }
          catch { toast({ tone: "error", title: "Couldn't develop it", body: "Only whoever started the roll can do that." }); }
        }} />
    );
  }
  if (dialog === "rename") {
    const save = async (e) => {
      e.preventDefault();
      const t = name.trim();
      if (!t) return setError("Give it a name.");
      if (checkName(t).error) return setError(checkName(t).error);
      try { await updateRoll(roll, { title: t }); onChange({ ...roll, title: t }); onDialog(null); }
      catch { setError("Couldn't rename it. Try another name."); }
    };
    return (
      <Dialog title="Rename roll" onClose={() => onDialog(null)} size="sm"
        footer={<div className="flex justify-end gap-2"><Button onClick={() => onDialog(null)}>Cancel</Button><Button type="submit" form="rename-roll" variant="primary">Save</Button></div>}>
        <form id="rename-roll" onSubmit={save}>
          <Field label="Name" error={error} count={name.length} max={60}><Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        </form>
      </Dialog>
    );
  }
  if (dialog === "people") {
    const others = (roll.members || []).filter((u) => u !== roll.ownerId);
    return (
      <Dialog title="People in this roll" onClose={() => onDialog(null)} size="sm">
        {!others.length && <p className="text-callout text-fg-muted">Nobody else has joined yet.</p>}
        <ul className="space-y-1">
          {others.map((uid) => (
            <li key={uid} className="flex min-h-14 items-center gap-3">
              <Avatar profile={people.get(uid) || { username: "?" }} size={36} />
              <span className="min-w-0 flex-1 truncate text-callout">@{people.get(uid)?.username || "someone"}</span>
              <Button size="sm" variant="danger-ghost" onClick={async () => {
                try { await removeFromRoll(roll, uid); onChange({ ...roll, members: roll.members.filter((m) => m !== uid) }); }
                catch { toast({ tone: "error", title: "Couldn't remove them" }); }
              }}>Remove</Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-fg-subtle">Their photos stay in the roll. You can delete any photo once it develops.</p>
      </Dialog>
    );
  }
  if (dialog === "delete") {
    return (
      <ConfirmDialog title="Delete this roll?" confirmLabel="Delete roll" onClose={() => onDialog(null)}
        body="Every photo in it goes, for everyone. This can't be undone."
        onConfirm={async () => {
          try { await deleteRoll(roll); toast({ title: "Roll deleted" }); navigate("/rolls", { replace: true }); }
          catch { toast({ tone: "error", title: "Couldn't delete the roll" }); }
        }} />
    );
  }
  if (dialog === "leave") {
    return (
      <ConfirmDialog title="Leave this roll?" confirmLabel="Leave" onClose={() => onDialog(null)}
        body="You won't see its photos when it develops. Shots you've taken stay in it for everyone else."
        onConfirm={async () => {
          try { await leaveRoll(roll); navigate("/rolls", { replace: true }); }
          catch { toast({ tone: "error", title: "Couldn't leave" }); }
        }} />
    );
  }
  return null;
}

function InviteDialog({ roll, onClose }) {
  const toast = useToast();
  const [qr, setQr] = useState("");
  const url = rollUrl(roll.id);
  useEffect(() => {
    let live = true;
    import("qrcode").then((m) => (m.default || m).toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: "M", color: { dark: "#111114", light: "#ffffff" } }))
      .then((d) => { if (live) setQr(d); }).catch(() => {});
    return () => { live = false; };
  }, [url]);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: roll.title, text: `Join my roll on Mesh: ${roll.title}`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); }
    } catch { /* dismissed */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } catch { toast({ tone: "error", title: "Couldn't copy" }); } };
  return (
    <Dialog title="Invite people" onClose={onClose} size="sm">
      <p className="text-callout text-fg-muted">Anyone with the link can join until it develops, or until you close joining. Let people scan this:</p>
      <div className="mx-auto mt-4 w-full max-w-[280px] rounded-card bg-white p-3">
        {qr ? <img src={qr} alt={`QR code to join ${roll.title}`} className="block w-full" /> : <span className="block aspect-square w-full" />}
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-caption text-fg-subtle"><QrCode size={14} aria-hidden="true" /> Scan with a phone camera</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="primary" icon={Share2} onClick={share}>Share link</Button>
        <Button icon={Copy} onClick={copy}>Copy link</Button>
      </div>
    </Dialog>
  );
}

function RemindDialog({ roll, onClose }) {
  const toast = useToast();
  const [push, setPush] = useState(null);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState(false);
  useEffect(() => { pushState().then(setPush).catch(() => setPush("unsupported")); }, []);
  const notifyMe = async () => {
    setBusy(true);
    try {
      const s = await enablePush();
      setPush(s);
      if (s === "on" && await remind("roll", roll.id)) { toast({ title: "You'll get a notification", body: `When it develops, ${developLabel(tsMillis(roll.developAt))}.` }); onClose(); }
      if (s === "install") setInstall(true);
    } catch { toast({ tone: "error", title: "Couldn't turn on notifications" }); }
    finally { setBusy(false); }
  };
  const download = () => {
    const blob = new Blob([rollIcs(roll)], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "roll-develops.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  return (
    <Dialog title="Remind me when it develops" onClose={onClose} size="sm">
      {push === "on" ? (
        <p className="flex items-start gap-2 rounded-control bg-accent-soft p-3 text-callout text-fg">
          <Bell size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" /> Notifications are on: this phone will tell you when it develops, {developLabel(tsMillis(roll.developAt))}.
        </p>
      ) : push === "off" || push === "install" ? (
        <Button variant="primary" full icon={Bell} loading={busy} onClick={push === "install" ? () => setInstall(true) : notifyMe}>
          {push === "install" ? "Add Mesh to your home screen to get notified" : "Notify me on this phone"}
        </Button>
      ) : null}
      <p className="mt-4 text-callout text-fg-muted">Or add it to your calendar, and your calendar will remind you {developLabel(tsMillis(roll.developAt))}.</p>
      <div className="mt-3 grid gap-2">
        <a href={rollGoogleCalendarUrl(roll)} target="_blank" rel="noopener noreferrer"
          className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong px-4 text-callout font-semibold hover:bg-surface-2">
          Google Calendar <ExternalLink size={14} aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
        </a>
        <Button icon={Download} onClick={download}>Apple, Outlook and others</Button>
      </div>
      {install && <InstallDialog reason="On iPhone, Mesh can only send notifications once it's on your home screen." onClose={() => setInstall(false)} />}
    </Dialog>
  );
}

// After 9am: the contact sheet.

const photoFile = (photo, name) => rollPhotoFile(photo, name);

function Developed({ roll, onChange }) {
  const toast = useToast();
  const { openComposer } = useShell();
  const [photos, setPhotos] = useState(null);
  const [people, setPeople] = useState(new Map());
  const [who, setWho] = useState("all");
  const [open, setOpen] = useState(null); // index into shown
  const [dialog, setDialog] = useState(null);
  // Picking photos for a post: their ids, in the order picked (null when not picking).
  const [picking, setPicking] = useState(null);
  const [posting, setPosting] = useState(false);
  // The first time this device opens it, the prints develop in front of you.
  const [reveal] = useState(() => !rollSeen(roll.id) && !motionReduced());
  const owner = roll.ownerId === me();

  useEffect(() => {
    fetchRollPhotos(roll.id).then((list) => { setPhotos(list); markRollSeen(roll.id); }).catch(() => setPhotos([]));
  }, [roll.id]);
  useEffect(() => {
    const ids = [...new Set((photos || []).map((p) => p.authorId))];
    if (ids.length) fetchProfiles(ids).then(setPeople).catch(() => {});
  }, [photos]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const p of photos || []) m.set(p.authorId, (m.get(p.authorId) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [photos]);
  const shown = useMemo(() => (photos || []).filter((p) => who === "all" || p.authorId === who), [photos, who]);
  const name = (uid) => (uid === me() ? "You" : `@${people.get(uid)?.username || "someone"}`);
  const date = new Date(tsMillis(roll.developAt)).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const postPicked = async () => {
    setPosting(true);
    try {
      const files = await pickedRollFiles(photos, picking);
      setPicking(null);
      openComposer({ kind: "post", files });
    } catch { toast({ tone: "error", title: "Couldn't get those photos", body: "Check your connection and try again." }); }
    finally { setPosting(false); }
  };

  const remove = async (p) => {
    try {
      await deleteRollPhoto(roll, p);
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      setOpen(null);
      toast({ title: "Photo deleted" });
    } catch { toast({ tone: "error", title: "Couldn't delete that photo" }); }
  };

  return (
    <Frame title={roll.title} right={<RollMenu roll={roll} owner={owner} onChange={onChange} onDialog={setDialog} />}>
      <div className="text-center">
        <p className="text-caption font-semibold uppercase tracking-wider text-accent-text">Developed {date}</p>
        <h1 className="mt-1 font-display text-title-1">{roll.title}</h1>
        <p className="mt-1 text-callout text-fg-muted">
          {photos ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"} by ${counts.length} ${counts.length === 1 ? "person" : "people"}` : " "}
        </p>
      </div>

      {counts.length > 1 && (
        <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0" role="radiogroup" aria-label="Whose photos">
          {[["all", photos.length], ...counts].map(([id, n]) => (
            <button key={id} type="button" role="radio" aria-checked={who === id} onClick={() => setWho(id)}
              className={`press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${who === id ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3"}`}>
              {id === "all" ? "Everyone" : name(id)} <span className="opacity-60 tabular">{n}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 && !picking && (
        <div className="mt-4 flex justify-center">
          <Button icon={Share2} onClick={() => setPicking([])}>Pick photos to post</Button>
        </div>
      )}

      {photos === null && <div className="mt-5 grid grid-cols-3 gap-1">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] !rounded-[4px]" />)}</div>}
      {photos?.length === 0 && <EmptyState compact icon={Aperture} title="Nobody shot anything" body="This roll developed empty." />}
      {shown.length > 0 && picking && (
        <div className="mt-5 pb-28">
          <p className="mb-3 text-center text-caption text-fg-subtle">Tap photos in the order you want them, up to {MAX_SLIDES}. You can still change the order before posting.</p>
          <PickablePhotos photos={shown} picked={picking} onChange={setPicking} />
        </div>
      )}
      {picking && (
        <div className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-canvas/95 px-4 pb-safe pt-3 backdrop-blur glass-solid">
          <div className="mx-auto max-w-2xl space-y-2 pb-3">
            <OthersNote photos={photos} picked={picking} />
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setPicking(null)}>Cancel</Button>
              <span className="flex-1 text-caption text-fg-subtle tabular">{picking.length ? `${picking.length} picked` : "None picked yet"}</span>
              <Button variant="primary" disabled={!picking.length} loading={posting} onClick={postPicked}>
                Post {picking.length > 1 ? `${picking.length} photos` : "photo"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {shown.length > 0 && !picking && (
        <ul className="mt-5 grid grid-cols-3 gap-1" aria-label="Photos">
          {shown.map((p, i) => (
            <li key={p.id} className={reveal ? "roll-print" : ""} style={reveal ? { animationDelay: `${Math.min(i, 40) * 90}ms` } : undefined}>
              <button type="button" onClick={() => setOpen(i)} aria-label={`Photo ${i + 1} by ${name(p.authorId)}`}
                className="press block aspect-[3/4] w-full overflow-hidden rounded-[4px] bg-surface-2">
                <MediaImg src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open !== null && shown[open] && (
        <Viewer photos={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)} name={name}
          canDelete={(p) => p.authorId === me() || owner} onDelete={remove}
          onPost={async (p) => {
            try { const file = await photoFile(p, `roll-${p.id}.jpg`); setOpen(null); openComposer({ kind: "post", files: [file] }); }
            catch { toast({ tone: "error", title: "Couldn't open that photo" }); }
          }} />
      )}
      <ManageDialogs roll={roll} dialog={dialog} onDialog={setDialog} onChange={onChange} people={people} />
    </Frame>
  );
}

function Viewer({ photos, index, onIndex, onClose, name, canDelete, onDelete, onPost }) {
  const toast = useToast();
  const p = photos[index];
  const touch = useRef(null);
  const go = useCallback((d) => onIndex((i) => Math.min(photos.length - 1, Math.max(0, i + d))), [onIndex, photos.length]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  const save = async () => {
    try {
      const file = await photoFile(p, `mesh-roll-${p.id}.jpg`);
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch { toast({ tone: "error", title: "Couldn't save that photo" }); }
  };
  const share = async () => {
    try {
      const file = await photoFile(p, `mesh-roll-${p.id}.jpg`);
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else return save();
    } catch (err) { if (err?.name !== "AbortError") toast({ tone: "error", title: "Couldn't share that photo" }); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-[55] flex flex-col bg-black text-white anim-fade"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      <div className="flex items-center gap-2 px-2 pt-safe">
        <button type="button" onClick={onClose} aria-label="Close" className="press flex h-11 w-11 items-center justify-center rounded-full"><X size={24} aria-hidden="true" /></button>
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{name(p.authorId)}</p>
        <p className="pr-3 text-caption text-white/60 tabular">{index + 1} / {photos.length}</p>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <MediaImg key={p.id} src={p.url} alt={`Photo by ${name(p.authorId)}`} className="max-h-full max-w-full object-contain" placeholderClass="aspect-[3/4] h-full max-h-full" />
        {index > 0 && <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="press absolute left-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/15 md:flex"><ChevronLeft size={24} aria-hidden="true" /></button>}
        {index < photos.length - 1 && <button type="button" onClick={() => go(1)} aria-label="Next photo" className="press absolute right-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/15 md:flex"><ChevronRight size={24} aria-hidden="true" /></button>}
      </div>
      <div className="flex items-center justify-center gap-2 px-4 pb-safe pt-3">
        <Button className="!bg-white/15 !text-white" icon={Download} onClick={save}>Save</Button>
        <Button className="!bg-white/15 !text-white" icon={Share2} onClick={share}>Share</Button>
        <Button variant="primary" onClick={() => onPost(p)}>Post</Button>
        {canDelete(p) && <IconButton icon={Trash2} label="Delete photo" tone="overlay" onClick={() => onDelete(p)} />}
      </div>
    </div>
  );
}

export { InviteDialog };
