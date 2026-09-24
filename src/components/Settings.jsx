import { useState } from "react";
import { signOut } from "firebase/auth";
import {
  Lock, Mail, Phone, KeyRound, ShieldCheck, Download, FileText, LogOut, Trash2, ChevronRight, CalendarDays, Scale,
} from "lucide-react";
import { auth } from "../firebase";
import { changePassword, resetPassword, reauthenticateAndDelete, authMessage } from "../lib/auth";
import { exportMyData, deleteMyAccountData, updateProfileFields, me, POLICY_VERSION, tsMillis } from "../lib/db";
import { validBirthYear } from "../lib/validate";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import Badge from "./ui/Badge";
import { Field, Input } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

const PROVIDERS = { password: "Email and password", "google.com": "Google", "apple.com": "Apple", phone: "Phone" };

/* Private settings. Nothing on this page is visible to anyone else, the
   header says so, because the line between "my profile" and "my account"
   is exactly where people get confused about who can see what. */
export default function Settings() {
  const { profile, setProfile } = useShell();
  const user = auth.currentUser;
  const providers = user?.providerData?.map((p) => p.providerId) || [];
  const hasPassword = providers.includes("password");
  const [dialog, setDialog] = useState(null); // password | birthyear | delete | signout

  const accepted = tsMillis(profile?.termsAcceptedAt);
  const outdated = profile?.termsVersion && profile.termsVersion !== POLICY_VERSION;

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
              meta={user?.email ? (user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>) : null} />
            <Row icon={Phone} label="Phone" value={user?.phoneNumber || "Not set"} />
            <Row icon={ShieldCheck} label="Signs in with" value={providers.map((p) => PROVIDERS[p] || p).join(", ") || "None"} />
            <Row icon={KeyRound} label="Password"
              value={hasPassword ? "••••••••" : "Managed by your sign-in provider"}
              action={hasPassword
                ? <Button size="sm" onClick={() => setDialog("password")}>Change</Button>
                : user?.email && <SetPasswordButton email={user.email} />} />
          </Group>

          <Group title="Age">
            <Row icon={CalendarDays} label="Birth year"
              value={profile?.birthYear > 0 ? String(profile.birthYear) : "Not set"}
              help={profile?.birthYear > 0
                ? "Used only to apply age protections, and never shown on your profile. It can't be changed once set, so contact us if it's wrong."
                : "Set it once to post publicly. It's used only for age protections and never shown to anyone."}
              action={!(profile?.birthYear > 0) && <Button size="sm" onClick={() => setDialog("birthyear")}>Set</Button>} />
          </Group>

          <Group title="Your data">
            <DataExportRow />
            <Row icon={FileText} label="Terms and Privacy Policy"
              value={accepted ? `Version ${profile.termsVersion}, accepted ${new Date(accepted).toLocaleDateString()}` : "Accepted before this was recorded"}
              help={outdated ? "They've been updated since you accepted them. Worth a read." : null}
              onClick={() => navigate("/legal/privacy")} />
            <Row icon={Scale} label="All policies" value="Privacy, terms, cookies, guidelines, refunds" onClick={() => navigate("/legal")} />
          </Group>

          <Group title="Account">
            <Row icon={LogOut} label="Sign out" value="Of Mesh on this device" onClick={() => setDialog("signout")} />
            <Row icon={Trash2} label="Delete account" value="Permanently remove your account and posts" danger onClick={() => setDialog("delete")} />
          </Group>
        </div>
      </div>

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
            <Button variant="primary" icon={LogOut} onClick={() => { signOut(auth); navigate("/", { replace: true }); }}>Sign out</Button>
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
      await updateProfileFields(me(), { birthYear: v.year });
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
