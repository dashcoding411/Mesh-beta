import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import {
  Lock, Mail, Phone, KeyRound, ShieldCheck, Download, FileText, LogOut, Trash2, ChevronRight, CalendarDays, Scale,
  MessageCircle, MessageSquare, Ban, UserPlus, Check, X, Sparkles, EyeOff, Gavel, Plus,
  SunMoon, Type, Waves, PlayCircle, VolumeX, BrickWall, WandSparkles, Keyboard, Compass, Contrast,
} from "lucide-react";
import { plural } from "../lib/format";
import { interestById } from "../lib/interests";
import { auth } from "../firebase";
import { changePassword, resetPassword, reauthenticateAndDelete, authMessage, verifyEmail } from "../lib/auth";
import { OPTIONS as LOOKS, setAppearance, useAppearance } from "../lib/appearance";
import { replayTour } from "../lib/tour";
import { clearAllDrafts } from "../lib/drafts";
import { useBrick } from "../lib/useBrick";
import { hasAnyLimit, parentActive } from "../lib/brick";

function brickSummary(brick) {
  if (brick.state("")) return "Bricked right now";
  const p = brick.policy;
  if (!p || (!hasAnyLimit(p.self) && !parentActive(p, brick.now))) return "Off";
  return p.pending ? "On, with a change waiting" : "On";
}
import {
  exportMyData, deleteMyAccountData, POLICY_VERSION, tsMillis, isMinor, setMyBirthYear,
  setPrivacySettings, setPostsVisibility, removeMyReposts, fetchFollowRequests, approveFollowRequest, declineFollowRequest,
  fetchBlocked, unblockUser, openUserProfile, isAdmin, saveHiddenWords, fetchProfile, setHideAi as saveHideAi,
} from "../lib/db";
import Switch from "./ui/Switch";
import Segmented from "./ui/Segmented";
import IconButton from "./ui/IconButton";
import Avatar from "./ui/Avatar";
import { EmptyState } from "./ui/States";
import { validBirthYear } from "../lib/validate";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import Badge from "./ui/Badge";
import { Field, Input, Checkbox } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

const PROVIDERS = { password: "Email and password", "google.com": "Google", "apple.com": "Apple", phone: "Phone" };

export default function Settings() {
  const { profile, setProfile, interests, openInterests, hiddenWords, setHiddenWords, hideAi, setHideAi, muted } = useShell();
  const brick = useBrick();
  const [requests, setRequests] = useState(null);
  const [blockedList, setBlockedList] = useState(null);
  const [admin, setAdmin] = useState(false);

  const [, setChecked] = useState(0);
  useEffect(() => {
    fetchFollowRequests().then(setRequests).catch(() => setRequests([]));
    fetchBlocked().then(setBlockedList).catch(() => setBlockedList([]));
    isAdmin().then(setAdmin).catch(() => {});
    // Reload the auth user to pick up emailVerified after the link round-trip.
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      auth.currentUser.reload().then(() => setChecked((n) => n + 1)).catch(() => {});
    }
  }, []);
  const user = auth.currentUser;
  const providers = user?.providerData?.map((p) => p.providerId) || [];
  const hasPassword = providers.includes("password");
  const [dialog, setDialog] = useState(null); // password | birthyear | delete | signout | private | public | messages | comments | requests | blocked

  const accepted = tsMillis(profile?.termsAcceptedAt);
  const outdated = profile?.termsVersion && profile.termsVersion !== POLICY_VERSION;

  const toast = useToast();
  const toggleAi = (on) => {
    setHideAi(on);
    saveHideAi(on).catch(() => {
      setHideAi(!on);
      toast({ tone: "error", title: "Couldn't save that", body: "Check your connection and try again." });
    });
  };

  return (
    <>
      <TopBar title="Settings" back backTo="/account" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] space-y-6 px-4 pb-16 pt-5 md:px-6">
          <header className="hidden md:block">
            <h1 className="text-title-1">Settings</h1>
          </header>
          <p className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-caption text-fg-muted">
            <Lock size={14} aria-hidden="true" /> Private: only you can see this page.
          </p>

          <Group title="Sign-in">
            <Row icon={Mail} label="Email" value={user?.email || "Not set"}
              meta={user?.email ? (user.emailVerified ? <Badge tone="accent">Verified</Badge> : <Badge tone="warning">Not verified</Badge>) : null}
              help={user?.email && !user.emailVerified ? "Verifying lets you recover your account if you lose access." : null}
              action={user?.email && !user.emailVerified && <VerifyEmailButton email={user.email} />} />
            <Row icon={Phone} label="Phone" value={user?.phoneNumber || "Not set"} />
            <Row icon={ShieldCheck} label="Signs in with" value={providers.map((p) => PROVIDERS[p] || p).join(", ") || "None"} />
            <Row icon={KeyRound} label="Password"
              value={hasPassword ? "••••••••" : "Managed by your sign-in provider"}
              action={hasPassword
                ? <Button size="sm" onClick={() => setDialog("password")}>Change</Button>
                : user?.email && <SetPasswordButton email={user.email} />} />
          </Group>

          <Group title="Privacy and safety">
            <div className="flex min-h-14 items-start gap-3 px-4 py-3">
              <Lock size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <label htmlFor="private-switch" className="block text-callout font-medium text-fg">Private account</label>
                <span className="mt-0.5 block text-caption text-fg-subtle">
                  {profile?.isPrivate
                    ? "Only followers you approve see your posts and stories."
                    : "Anyone can follow you and see your public posts."}
                </span>
              </span>
              <Switch id="private-switch" checked={!!profile?.isPrivate}
                onChange={(on) => setDialog(on ? "private" : "public")} />
            </div>
            {profile?.isPrivate && (
              <Row icon={UserPlus} label="Follow requests"
                value={requests === null ? "Loading…" : requests.length ? `${requests.length} waiting` : "None waiting"}
                onClick={() => setDialog("requests")} />
            )}
            <Row icon={MessageCircle} label="Who can message you"
              value={profile?.messagePolicy === "following" ? "Only people you follow" : "Everyone (people you don't follow land in Requests)"}
              onClick={() => setDialog("messages")} />
            <Row icon={MessageSquare} label="Who can comment on your posts"
              value={{ following: "Only people you follow", off: "No one" }[profile?.commentPolicy] || "Everyone"}
              onClick={() => setDialog("comments")} />
            <Row icon={VolumeX} label="Muted accounts"
              value={muted.size ? `${muted.size} muted` : "No one"}
              onClick={() => setDialog("muted")} />
            <Row icon={Ban} label="Blocked accounts"
              value={blockedList === null ? "Loading…" : blockedList.length ? `${blockedList.length} blocked` : "No one"}
              onClick={() => setDialog("blocked")} />
          </Group>

          <Group title="Your feed">
            <Row icon={Sparkles} label="Your interests"
              value={interests?.length ? interests.map((id) => interestById(id)?.label).filter(Boolean).join(", ") : "None picked yet"}
              help="Shapes For you, Flicks and circle suggestions. Private: nobody else can see them."
              onClick={openInterests} />
            <Row icon={BrickWall} label="Brick mode"
              value={brickSummary(brick)}
              help="Lock Mesh down to messages and calls at set times, or after a daily limit. Loosening waits 24 hours."
              onClick={() => navigate("/account/brick")} />
            <Row icon={EyeOff} label="Hidden words"
              value={hiddenWords?.length ? plural(hiddenWords.length, "word or phrase", "words or phrases") : "None"}
              help="Posts and comments containing them are hidden for you, everywhere. Only you can see this list."
              onClick={() => setDialog("hidden")} />
            <Row icon={WandSparkles} label="Hide posts made with AI"
              value={hideAi ? "Hidden from Home, Flicks and Explore" : "Shown, with a Made with AI label"}
              help="Covers posts their authors labelled, and ones moderators labelled after a report. You'll still see them on people's profiles."
              action={<Switch label="Hide posts made with AI" checked={hideAi} onChange={toggleAi} />} />
          </Group>

          <Group title="Your data">
            <DataExportRow />
            <Row icon={FileText} label="Terms and Privacy Policy"
              value={accepted ? `Version ${profile.termsVersion}, accepted ${new Date(accepted).toLocaleDateString()}` : "Accepted before this was recorded"}
              help={outdated ? "They've been updated since you accepted them. Worth a read." : null}
              onClick={() => navigate("/legal/privacy")} />
            <Row icon={Scale} label="All policies" value="Privacy, terms, cookies, guidelines, refunds" onClick={() => navigate("/legal")} />
            <Row icon={Trash2} label="Delete account" value="Permanently delete your account and everything you've posted" danger onClick={() => setDialog("delete")} />
          </Group>

          <AppearanceGroup />

          <Group title="Help">
            <Row icon={Compass} label="Take the tour" value="A quick look at where everything is in Mesh" onClick={replayTour} />
          </Group>

          {admin && (
            <Group title="Moderation">
              <Row icon={Gavel} label="Moderation queue" value="Review reports and suspensions" onClick={() => navigate("/account/moderation")} />
            </Group>
          )}

          <Group title="Age">
            <Row icon={CalendarDays} label="Birth year"
              value={profile?.birthYear > 0 ? String(profile.birthYear) : "Not set"}
              help={profile?.birthYear > 0
                ? "Used only to apply age protections, and never shown on your profile. It can't be changed once set, so contact us if it's wrong."
                : "Set it once to post publicly. It's used only for age protections and never shown to anyone."}
              action={!(profile?.birthYear > 0) && <Button size="sm" onClick={() => setDialog("birthyear")}>Set</Button>} />
          </Group>

          <Group title="Account">
            <Row icon={LogOut} label="Sign out" value="Of Mesh on this device" onClick={() => setDialog("signout")} />
          </Group>
        </div>
      </div>

      {dialog === "private" && (
        <PrivacyDialog onClose={() => setDialog(null)} making="private"
          onDone={() => { setProfile({ ...profile, isPrivate: true }); setDialog(null); }} />
      )}
      {dialog === "public" && (
        <PrivacyDialog onClose={() => setDialog(null)} making="public" canPublic={!isMinor(profile)}
          onDone={() => { setProfile({ ...profile, isPrivate: false }); setDialog(null); }} />
      )}
      {dialog === "messages" && (
        <PolicyDialog title="Who can message you" field="messagePolicy" value={profile?.messagePolicy || "everyone"}
          options={[
            { id: "everyone", label: "Everyone", blurb: "People you don't follow can message you; their messages wait in Requests." },
            { id: "following", label: "Only people you follow", blurb: "Nobody else can start a conversation with you or add you to a group." },
          ]}
          onClose={() => setDialog(null)} onSaved={(v) => { setProfile({ ...profile, messagePolicy: v }); setDialog(null); }} />
      )}
      {dialog === "comments" && (
        <PolicyDialog title="Who can comment on your posts" field="commentPolicy" value={profile?.commentPolicy || "everyone"}
          options={[
            { id: "everyone", label: "Everyone", blurb: "Anyone who can see a post can comment on it." },
            { id: "following", label: "Only people you follow", blurb: "Everyone else can read comments but not add them." },
            { id: "off", label: "No one", blurb: "Comments are closed on all your posts. Existing ones stay visible." },
          ]}
          onClose={() => setDialog(null)} onSaved={(v) => { setProfile({ ...profile, commentPolicy: v }); setDialog(null); }} />
      )}
      {dialog === "requests" && (
        <RequestsDialog requests={requests || []} onClose={() => setDialog(null)}
          onChange={(list, approved) => { setRequests(list); if (approved) setProfile({ ...profile, followerCount: (profile.followerCount || 0) + 1 }); }} />
      )}
      {dialog === "blocked" && (
        <BlockedDialog list={blockedList || []} onClose={() => setDialog(null)} onChange={setBlockedList} />
      )}
      {dialog === "muted" && <MutedDialog onClose={() => setDialog(null)} />}
      {dialog === "hidden" && (
        <HiddenWordsDialog initial={hiddenWords || []} onClose={() => setDialog(null)}
          onSaved={(list) => { setHiddenWords(list); setDialog(null); }} />
      )}
      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === "birthyear" && (
        <BirthYearDialog onClose={() => setDialog(null)} onSaved={(y) => { setProfile({ ...profile, birthYear: y }); setDialog(null); }} />
      )}
      {dialog === "delete" && <DeleteDialog hasPassword={hasPassword} onClose={() => setDialog(null)} />}
      {dialog === "signout" && (
        <Dialog title="Sign out of Mesh?" variant="center" size="sm" onClose={() => setDialog(null)}>
          <p className="text-callout text-fg-muted">You'll need to sign in again on this device.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" icon={LogOut} onClick={() => { clearAllDrafts(); signOut(auth); navigate("/", { replace: true }); }}>Sign out</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Group({ title, children }) {
  return (
    <section aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`} className="mb-2 px-1 text-label font-semibold uppercase tracking-wider text-fg-subtle">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, value, meta, help, action, onClick, danger = false }) {
  const body = (
    <>
      <Icon size={20} className={`mt-0.5 shrink-0 ${danger ? "text-danger-text" : "text-fg-muted"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-callout font-medium ${danger ? "text-danger-text" : "text-fg"}`}>{label}{meta}</span>
        <span className="mt-0.5 block break-words text-caption text-fg-subtle">{value}</span>
        {help && <span className="mt-1 block text-caption text-fg-muted">{help}</span>}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick}
        className="press flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
        {body}
        <ChevronRight size={18} className="mt-0.5 shrink-0 self-center text-fg-subtle" aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="flex min-h-14 items-start gap-3 px-4 py-3">
      {body}
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// Per-device appearance settings.
function AppearanceGroup() {
  const look = useAppearance();
  const rows = [
    { key: "theme", icon: SunMoon, label: "Theme", help: "System follows your device's light or dark setting." },
    { key: "text", icon: Type, label: "Text size", help: "Scales all text and spacing in Mesh." },
    { key: "contrast", icon: Contrast, label: "Contrast", help: "High makes text, borders and outlines stronger. Follow system uses your device's setting." },
    { key: "motion", icon: Waves, label: "Motion", help: "Reduce turns off animations, and videos wait for you to press play." },
    { key: "autoplay", icon: PlayCircle, label: "Videos in feeds", help: "Autoplayed videos start muted. Tap to play saves data." },
  ];
  return (
    <Group title="Appearance">
      {rows.map(({ key, icon: Icon, label, help }) => (
        <div key={key} className="px-4 py-3">
          <div className="flex items-start gap-3">
            <Icon size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span id={`look-${key}`} className="block text-callout font-medium text-fg">{label}</span>
              <span className="mt-0.5 block text-caption text-fg-subtle">{help}</span>
            </span>
          </div>
          <Segmented className="mt-3" labelledBy={`look-${key}`} options={LOOKS[key]} value={look[key]}
            onChange={(v) => setAppearance({ [key]: v })} />
        </div>
      ))}
      {/* Shortcuts need a keyboard, so not on phones. */}
      <div className="hidden md:block">
        <Row icon={Keyboard} label="Keyboard shortcuts" value="Post, search and move around without the mouse. Press ? anywhere to see them."
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))} />
      </div>
      <p className="px-4 py-3 text-caption text-fg-subtle">Saved on this device only.</p>
    </Group>
  );
}

function VerifyEmailButton({ email }) {
  const toast = useToast();
  const [state, setState] = useState("idle"); // idle | busy | sent
  return (
    <Button size="sm" loading={state === "busy"} disabled={state === "sent"} onClick={async () => {
      setState("busy");
      try {
        await verifyEmail();
        setState("sent");
        toast({ title: "Check your email", body: `We sent a link to ${email}. Open it on any device.` });
      } catch (err) { setState("idle"); toast({ tone: "error", title: authMessage(err) }); }
    }}>{state === "sent" ? "Sent" : "Verify"}</Button>
  );
}

function SetPasswordButton({ email }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" loading={busy} onClick={async () => {
      setBusy(true);
      try { await resetPassword(email); toast({ title: "Check your email", body: `We sent a link to ${email} to set a password.` }); }
      catch (err) { toast({ tone: "error", title: authMessage(err) }); }
      finally { setBusy(false); }
    }}>Set one</Button>
  );
}

function DataExportRow() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mesh-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Your data is downloading", body: "A JSON file with your profile, posts, comments and more." });
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "Couldn't build your export", body: "Try again in a moment." });
    } finally { setBusy(false); }
  };
  return (
    <Row icon={Download} label="Download your data" value="Everything Mesh holds about you, as a file"
      action={<Button size="sm" loading={busy} onClick={run}>Download</Button>} />
  );
}

function PasswordDialog({ onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!current) errs.current = "Enter your current password.";
    if (next.length < 8) errs.next = "Use at least 8 characters.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      toast({ title: "Password changed" });
      onClose();
    } catch (err) {
      setErrors({ submit: authMessage(err) });
      setBusy(false);
    }
  };

  return (
    <Dialog title="Change password" onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Current password" error={errors.current}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters." error={errors.next}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <div aria-live="polite"><InlineMessage>{errors.submit}</InlineMessage></div>
        <Button type="submit" variant="primary" full loading={busy}>Change password</Button>
      </form>
    </Dialog>
  );
}

function BirthYearDialog({ onClose, onSaved }) {
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = validBirthYear(year);
    if (v.error) return setError(v.error);
    setBusy(true);
    try {
      await setMyBirthYear(v.year);
      onSaved(v.year);
    } catch {
      setError("Couldn't save that. It can only be set once. If it's already set, contact us to correct it.");
      setBusy(false);
    }
  };
  return (
    <Dialog title="Set your birth year" onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-callout text-fg-muted">
          This can only be set once, so check it. It's used for age protections and never shown to anyone.
        </p>
        <Field label="Birth year" error={error}>
          <Input inputMode="numeric" autoComplete="bday-year" value={year} maxLength={4}
            onChange={(e) => { setYear(e.target.value.replace(/\D/g, "")); setError(""); }} placeholder="e.g. 2001" />
        </Field>
        <Button type="submit" variant="primary" full loading={busy}>Save birth year</Button>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ hasPassword, onClose }) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (confirmText !== "DELETE") return setError("Type DELETE in capitals to confirm.");
    if (hasPassword && !password) return setError("Enter your password to confirm it's you.");
    setBusy(true);
    try {
      await deleteMyAccountData();
      await reauthenticateAndDelete(hasPassword ? password : null);
      clearAllDrafts();
      navigate("/", { replace: true });
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Delete your account?" onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-callout text-fg-muted">
          This permanently removes your profile, posts, reposts and handle. Messages you've sent stay visible to the
          people you sent them to. <strong className="text-fg">This can't be undone.</strong>
        </p>
        <p className="text-caption text-fg-subtle">Want a copy first? Download your data from Settings before you go.</p>
        {hasPassword && (
          <Field label="Your password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <Field label={<>Type <span className="font-mono">DELETE</span> to confirm</>}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        </Field>
        <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>Keep my account</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={confirmText !== "DELETE"}>Delete account permanently</Button>
        </div>
      </form>
    </Dialog>
  );
}

// Going private also flips public posts to followers-only (the rules require it).
function PrivacyDialog({ making, canPublic = true, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [republish, setRepublish] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      if (making === "private") {
        await setPrivacySettings({ isPrivate: true });
        const { done } = await setPostsVisibility("followers");
        await removeMyReposts();
        toast({ title: "Your account is private", body: done ? `${done} post${done === 1 ? "" : "s"} switched to followers-only.` : "New followers will need your approval." });
      } else {
        await setPrivacySettings({ isPrivate: false });
        if (republish) {
          const { done } = await setPostsVisibility("public");
          toast({ title: "Your account is public", body: `${done} post${done === 1 ? "" : "s"} made public again.` });
        } else toast({ title: "Your account is public", body: "Your existing posts stay followers-only." });
      }
      onDone();
    } catch {
      toast({ tone: "error", title: "Couldn't change your account's privacy" });
      setBusy(false);
    }
  };

  return (
    <Dialog title={making === "private" ? "Make your account private?" : "Make your account public?"} onClose={onClose} size="sm">
      {making === "private" ? (
        <ul className="space-y-2 text-callout text-fg-muted">
          <li>New followers will need your approval. People who already follow you stay.</li>
          <li>Your public posts become followers-only, and new posts are followers-only.</li>
          <li>Your stories are for followers only.</li>
          <li>Your reposts are removed, since reposts are public. You can repost again if you go public.</li>
          <li>Posts inside circles follow each circle's own settings.</li>
        </ul>
      ) : (
        <>
          <p className="text-callout text-fg-muted">Anyone will be able to follow you without asking. Pending requests stay until you answer them.</p>
          {canPublic && (
            <div className="mt-3 rounded-card border border-line bg-surface-2 px-3">
              <Checkbox checked={republish} onChange={setRepublish} description="Otherwise they stay followers-only.">
                Also make my followers-only posts public
              </Checkbox>
            </div>
          )}
        </>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={Lock} loading={busy} onClick={go}>
          {making === "private" ? "Make private" : "Make public"}
        </Button>
      </div>
    </Dialog>
  );
}

function PolicyDialog({ title, field, value, options, onClose, onSaved }) {
  const toast = useToast();
  const [choice, setChoice] = useState(value);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await setPrivacySettings({ [field]: choice });
      toast({ title: "Saved" });
      onSaved(choice);
    } catch {
      toast({ tone: "error", title: "Couldn't save that" });
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={onClose} size="sm">
      <div role="radiogroup" aria-label={title} className="space-y-2">
        {options.map((o) => (
          <label key={o.id} className={`press flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
            choice === o.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
          }`}>
            <input type="radio" name={field} checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
            <span>
              <span className="block text-callout font-semibold">{o.label}</span>
              <span className="block text-caption text-fg-muted">{o.blurb}</span>
            </span>
          </label>
        ))}
      </div>
      <Button variant="primary" full className="mt-5" loading={busy} disabled={choice === value} onClick={save}>Save</Button>
    </Dialog>
  );
}

function RequestsDialog({ requests, onClose, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const decide = async (r, approve) => {
    setBusy(r.id);
    try {
      if (approve) await approveFollowRequest(r); else await declineFollowRequest(r);
      onChange(requests.filter((x) => x.id !== r.id), approve);
      toast({ title: approve ? `@${r.username || "They"} can now see your posts` : "Request declined" });
    } catch {
      toast({ tone: "error", title: "Couldn't answer that request" });
    } finally { setBusy(""); }
  };
  return (
    <Dialog title="Follow requests" onClose={onClose}>
      {requests.length === 0 ? (
        <EmptyState compact icon={UserPlus} title="No one's waiting" body="When someone asks to follow your private account, they show up here." />
      ) : (
        <ul className="space-y-1">
          {requests.map((r) => (
            <li key={r.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
              <button type="button" onClick={() => { onClose(); openUserProfile(r.id); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar profile={{ username: r.username || "?" }} size={40} />
                <span className="truncate text-callout font-medium">@{r.username || "someone"}</span>
              </button>
              <Button size="sm" variant="primary" icon={Check} loading={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
              <IconButton icon={X} label={`Decline @${r.username || "request"}`} disabled={busy === r.id} onClick={() => decide(r, false)} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function BlockedDialog({ list, onClose, onChange }) {
  const toast = useToast();
  const { setBlocked } = useShell();
  const unblock = async (b) => {
    try {
      await unblockUser(b.id);
      onChange(list.filter((x) => x.id !== b.id));
      setBlocked((prev) => { const n = new Set(prev); n.delete(b.id); return n; });
      toast({ title: `Unblocked @${b.username || "them"}` });
    } catch { toast({ tone: "error", title: "Couldn't unblock" }); }
  };
  return (
    <Dialog title="Blocked accounts" onClose={onClose}>
      <p className="mb-3 text-callout text-fg-muted">
        Blocked people can't follow you, message you, add you to groups or comment on your posts, and you don't see their posts. They aren't told.
      </p>
      {list.length === 0 ? (
        <EmptyState compact icon={Ban} title="You haven't blocked anyone" body="Block someone from their profile or your conversation with them." />
      ) : (
        <ul className="space-y-1">
          {list.map((b) => (
            <li key={b.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
              <Avatar profile={{ username: b.username || "?" }} size={40} />
              <span className="min-w-0 flex-1 truncate text-callout">@{b.username || "someone"}</span>
              <Button size="sm" onClick={() => unblock(b)}>Unblock</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// Muted accounts are stored as ids; resolve handles for display.
function MutedDialog({ onClose }) {
  const { muted, toggleMute } = useShell();
  const [people, setPeople] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([...muted].slice(0, 200).map((id) => fetchProfile(id).catch(() => null)))
      .then((list) => { if (live) setPeople(list.filter(Boolean)); });
    return () => { live = false; };
    // Resolve once per mount; unmutes update the list locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = people?.filter((p) => muted.has(p.id));
  return (
    <Dialog title="Muted accounts" onClose={onClose}>
      <p className="mb-3 text-callout text-fg-muted">
        You don't see muted people's posts, Flicks, stories or comments. You still follow them if you did, they can still message you, and they aren't told.
      </p>
      {shown === undefined ? (
        <div className="space-y-2" role="status" aria-label="Loading muted accounts">
          {[0, 1].map((i) => <div key={i} className="skeleton h-14 rounded-control" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState compact icon={VolumeX} title="You haven't muted anyone" body="Mute someone from a post's menu or their profile." />
      ) : (
        <ul className="space-y-1">
          {shown.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
              <Avatar profile={p} size={40} />
              <button type="button" onClick={() => { onClose(); openUserProfile(p.id); }} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-callout font-medium">{p.name || p.username}</span>
                <span className="block truncate text-caption text-fg-subtle">@{p.username}</span>
              </button>
              <Button size="sm" onClick={() => toggleMute({ id: p.id, username: p.username }, false)}>Unmute</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// Private hidden-words list, applied client-side across feeds, search and comments.
function HiddenWordsDialog({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [words, setWords] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const add = (e) => {
    e?.preventDefault();
    const w = draft.trim().toLowerCase();
    if (!w || words.includes(w) || words.length >= 200) return;
    setWords([...words, w.slice(0, 60)]);
    setDraft("");
  };
  const save = async () => {
    setBusy(true);
    try {
      const list = await saveHiddenWords(words);
      toast({ title: "Hidden words saved" });
      onSaved(list);
    } catch {
      toast({ tone: "error", title: "Couldn't save them" });
      setBusy(false);
    }
  };

  return (
    <Dialog title="Hidden words" onClose={busy ? undefined : onClose}
      footer={<div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>Save</Button>
      </div>}>
      <p className="mb-4 text-callout text-fg-muted">
        Posts and comments with these words or phrases are hidden for you. Mesh already blocks slurs and attacks on groups for
        everyone; this is for anything else you'd rather not see.
      </p>
      <form onSubmit={add} className="flex items-end gap-2">
        <Field label="Add a word or phrase" className="flex-1">
          <Input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. spoilers" />
        </Field>
        <Button type="submit" icon={Plus} disabled={!draft.trim()}>Add</Button>
      </form>
      {words.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your hidden words">
          {words.map((w) => (
            <li key={w} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface-2 pl-3 text-callout">
              {w}
              <IconButton icon={X} label={`Remove ${w}`} size={14} onClick={() => setWords(words.filter((x) => x !== w))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-caption text-fg-subtle">No hidden words yet.</p>
      )}
    </Dialog>
  );
}
