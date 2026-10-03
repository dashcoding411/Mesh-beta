import { useState } from "react";
import { Download, LogOut, Trash2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { exportMyData } from "../lib/db";
import { clearAllDrafts } from "../lib/drafts";
import { LogoMark } from "./shell/Sidebar";
import Button from "./ui/Button";
import { useToast } from "./ui/toast-context";
import { BirthYearDialog, DeleteDialog } from "./Settings";

/**
 * Mesh is 16 and over (Online Safety Amendment (Social Media Minimum Age) Act
 * 2024). Accounts made before birth years were required are asked for one;
 * an account that turns out to be under 16 can only download its data,
 * delete itself or sign out.
 */
export default function AgeGate({ profile, onBirthYear }) {
  if (!(profile?.birthYear > 0)) {
    return (
      <Screen>
        <BirthYearDialog title="Confirm your age" dismissible={false} onClose={() => {}} onSaved={onBirthYear} />
      </Screen>
    );
  }
  return <UnderAge />;
}

function Screen({ children }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <LogoMark size={52} />
      {children}
    </main>
  );
}

function UnderAge() {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPassword = (auth.currentUser?.providerData || []).some((p) => p.providerId === "password");

  const download = async () => {
    setBusy(true);
    try {
      const data = await exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `mesh-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ tone: "error", title: "Couldn't build your download", body: "Try again in a moment." });
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <h1 className="mt-6 font-display text-title-1">Mesh is for people 16 and over</h1>
      <p className="mt-3 max-w-md text-body text-fg-muted">
        Australian law doesn&apos;t allow social media accounts for people under 16, and the birth year on this account says
        you&apos;re younger than that. You can download what you&apos;ve posted and then delete the account. Come back when you&apos;re 16.
      </p>
      <p className="mt-2 max-w-md text-caption text-fg-subtle">
        If your birth year is wrong, email legal@joinmesh.social from the address on your account.
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button icon={Download} loading={busy} onClick={download}>Download my data</Button>
        <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>Delete my account</Button>
        <Button variant="ghost" icon={LogOut} onClick={() => { clearAllDrafts(); signOut(auth); }}>Sign out</Button>
      </div>
      {deleting && <DeleteDialog hasPassword={hasPassword} onClose={() => setDeleting(false)} />}
    </Screen>
  );
}
