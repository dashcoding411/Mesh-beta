import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { changePassword, resetPassword, reauthenticateAndDelete, authMessage } from "../lib/auth";
import { exportMyData, deleteMyAccountData, me, POLICY_VERSION, tsMillis } from "../lib/db";

/* The Account layer is private: credentials, security, data and account
   status. Nothing here is visible to other users — that's the Profile. */

const FIELD =
  "w-full min-h-[44px] rounded-xl bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 text-base " +
  "focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 transition";

export default function AccountPage({ profile, onOpenLegal }) {
  const user = auth.currentUser;
  const providers = user?.providerData?.map((p) => p.providerId) || [];
  const hasPassword = providers.includes("password");

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <header>
          <h2 className="text-xl font-bold">Account</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Private settings — your credentials, security and data. What other people see lives on your{" "}
            <span className="text-zinc-300">Profile</span>.
          </p>
        </header>

        <Card title="Sign-in details" subtitle="How you get into Mesh.">
          <Row label="Email" value={user?.email || "Not set"} />
          <Row label="Phone" value={user?.phoneNumber || "Not set"} />
          <Row label="Account ID" value={me()} mono />
          <Row
            label="Sign-in methods"
            value={
              providers.length
                ? providers.map((p) => PROVIDER_NAMES[p] || p).join(", ")
                : "None"
            }
          />
          <Row
            label="Email verified"
            value={user?.emailVerified ? "Yes" : user?.email ? "No" : "—"}
          />
        </Card>

        {hasPassword ? <PasswordCard /> : <ResetOnlyCard email={user?.email} />}

        <Card title="Your data" subtitle="Export everything Mesh holds about you.">
          <DataExport />
        </Card>

        <Card title="Agreements" subtitle="What you accepted, and when.">
          <Row
            label="Terms and Privacy Policy"
            value={
              profile?.termsAcceptedAt
                ? `Accepted ${new Date(tsMillis(profile.termsAcceptedAt)).toLocaleDateString()}`
                : "Accepted before this was recorded"
            }
          />
          <Row label="Version accepted" value={profile?.termsVersion || "—"} />
          {profile?.termsVersion && profile.termsVersion !== POLICY_VERSION && (
            <p className="text-sm text-amber-300 pt-1">
              These have been updated since you accepted them. Worth a read.
            </p>
          )}
          <button onClick={onOpenLegal}
            className="mt-2 min-h-[44px] w-full rounded-xl border border-zinc-700 hover:border-violet-500 px-4 text-sm font-medium text-zinc-200 transition">
            Read the policies
          </button>
        </Card>

        <Card title="Danger zone" subtitle="These actions cannot be undone." danger>
          <SignOutRow />
          <DeleteAccount hasPassword={hasPassword} />
        </Card>
      </div>
    </div>
  );
}

const PROVIDER_NAMES = {
  password: "Email & password",
  "google.com": "Google",
  "apple.com": "Apple",
  phone: "Phone",
};

function Card({ title, subtitle, children, danger }) {
  return (
    <section
      className={`rounded-2xl border p-5 ${
        danger ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <h3 className={`font-semibold ${danger ? "text-red-300" : ""}`}>{title}</h3>
      {subtitle && <p className="text-xs text-zinc-400 mt-0.5 mb-4">{subtitle}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm border-b border-zinc-800/60 pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-400 shrink-0">{label}</span>
      <span className={`text-zinc-200 text-right break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg({ error: "", ok: "" });
    if (next.length < 8) return setMsg({ error: "New password must be at least 8 characters.", ok: "" });
    setBusy(true);
    try {
      await changePassword(current, next);
      setMsg({ error: "", ok: "Password updated." });
      setCurrent(""); setNext(""); setOpen(false);
    } catch (err) {
      setMsg({ error: authMessage(err), ok: "" });
    } finally { setBusy(false); }
  };

  return (
    <Card title="Password" subtitle="Change the password used to sign in.">
      {!open ? (
        <div className="flex items-center justify-between gap-4">
          <div aria-live="polite" className="text-sm">
            {msg.ok ? <span className="text-emerald-400">{msg.ok}</span> : <span className="text-zinc-400">••••••••</span>}
          </div>
          <button onClick={() => setOpen(true)}
            className="min-h-[44px] rounded-xl border border-zinc-700 hover:border-violet-500 px-4 text-sm font-medium transition">
            Change password
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <input className={FIELD} type="password" autoComplete="current-password" placeholder="Current password"
            value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Current password" />
          <input className={FIELD} type="password" autoComplete="new-password" placeholder="New password (8+ characters)"
            value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" />
          <div aria-live="polite" className="min-h-[1rem]">
            {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setMsg({ error: "", ok: "" }); }}
              className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold">Cancel</button>
            <button disabled={busy}
              className="flex-1 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold">
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function ResetOnlyCard({ email }) {
  const [msg, setMsg] = useState("");
  return (
    <Card title="Password" subtitle="You sign in with a provider, so there's no Mesh password.">
      <div className="flex items-center justify-between gap-4">
        <p aria-live="polite" className="text-sm text-zinc-400">{msg || "Managed by your sign-in provider."}</p>
        {email && (
          <button
            onClick={async () => {
              try { await resetPassword(email); setMsg("Reset link sent."); }
              catch (err) { setMsg(authMessage(err)); }
            }}
            className="min-h-[44px] rounded-xl border border-zinc-700 hover:border-violet-500 px-4 text-sm font-medium transition shrink-0">
            Set a password
          </button>
        )}
      </div>
    </Card>
  );
}

function DataExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true); setError("");
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mesh-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Couldn't build your export. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-zinc-400">
        Downloads your profile, posts, comments, groups and events as JSON.
      </p>
      <button onClick={run} disabled={busy}
        className="min-h-[44px] rounded-xl border border-zinc-700 hover:border-violet-500 px-4 text-sm font-medium transition shrink-0 disabled:opacity-50">
        {busy ? "Preparing…" : "Download"}
      </button>
      <span aria-live="polite" className="sr-only">{error}</span>
    </div>
  );
}

function SignOutRow() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-red-500/20 pb-3">
      <p className="text-sm text-zinc-300">Sign out of Mesh on this device.</p>
      <button onClick={() => signOut(auth)}
        className="min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 text-sm font-semibold shrink-0">
        Sign out
      </button>
    </div>
  );
}

function DeleteAccount({ hasPassword }) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (confirmText !== "DELETE") return setError('Type DELETE exactly to confirm.');
    setBusy(true);
    try {
      await deleteMyAccountData();
      await reauthenticateAndDelete(hasPassword ? password : null);
      // onAuthStateChanged returns the app to the login screen.
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-300">Permanently delete your account and content.</p>
        <button onClick={() => setOpen(true)}
          className="min-h-[44px] rounded-xl bg-red-600/80 hover:bg-red-600 px-4 text-sm font-semibold shrink-0">
          Delete account
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-sm text-zinc-300">
        This removes your profile, posts, comments and username. It cannot be undone.
      </p>
      {hasPassword && (
        <input className={FIELD} type="password" autoComplete="current-password" placeholder="Your password"
          value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Current password" />
      )}
      <input className={FIELD} placeholder="Type DELETE to confirm" value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
      <div aria-live="polite" className="min-h-[1rem]">
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(""); setConfirmText(""); }}
          className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold">Cancel</button>
        <button disabled={busy}
          className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold">
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </form>
  );
}
