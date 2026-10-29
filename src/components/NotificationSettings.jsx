import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { PUSH_KINDS, disablePush, enablePush, pushState, savedKinds, setPushKinds } from "../lib/push";
import { useInstallState } from "../lib/install";
import { isNativeApp } from "../lib/native";
import Button from "./ui/Button";
import Switch from "./ui/Switch";
import InstallDialog from "./InstallDialog";
import { useToast } from "./ui/toast-context";

const STATUS = {
  unsupported: isNativeApp ? "Not in the iPhone app yet" : "Not available in this browser",
  install: "Add Mesh to your home screen first",
  denied: "Blocked in your phone or browser settings",
  off: "Off",
  on: "On",
};

/** Settings: install Mesh, push on or off for this device, and which kinds. */
export default function NotificationSettings({ Group }) {
  const toast = useToast();
  const install = useInstallState();
  const [state, setState] = useState(null);
  const [kinds, setKinds] = useState(savedKinds);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setState(s); }).catch(() => { if (live) setState("unsupported"); });
    return () => { live = false; };
  }, [install]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const next = await enablePush(kinds);
      setState(next);
      if (next === "on") toast({ title: "Notifications are on", body: "You'll hear about messages, calls and the things you picked below." });
      else if (next === "install") setDialog(true);
    } catch {
      toast({ tone: "error", title: "Couldn't turn on notifications", body: "Check your connection and try again." });
    } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { setState(await disablePush()); } finally { setBusy(false); }
  };
  const toggleKind = async (id, on) => {
    const next = on ? [...new Set([...kinds, id])] : kinds.filter((k) => k !== id);
    setKinds(next);
    try { await setPushKinds(next); }
    catch { setKinds(kinds); toast({ tone: "error", title: "Couldn't save that" }); }
  };

  return (
    <Group title="Notifications">
      {install !== "installed" && install !== "unavailable" && (
        <button type="button" id="set-install" onClick={() => setDialog(true)}
          className="press flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
          <Smartphone size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-callout font-medium text-fg">Install Mesh on this device</span>
            {install === "ios" && <span className="mt-0.5 block text-caption text-fg-subtle">Needed for notifications on iPhone</span>}
          </span>
        </button>
      )}
      <div id="set-push" className="flex min-h-14 items-start gap-3 px-4 py-3">
        {state === "on" ? <Bell size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" /> : <BellOff size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-medium text-fg">Push notifications</span>
          <span className="mt-0.5 block text-caption text-fg-subtle">{state ? STATUS[state] : "Checking…"}</span>
        </span>
        {state === "on" && <Switch label="Push notifications" checked onChange={turnOff} disabled={busy} />}
        {state === "off" && <Button size="sm" variant="primary" loading={busy} onClick={turnOn}>Turn on</Button>}
        {state === "install" && <Button size="sm" onClick={() => setDialog(true)}>How</Button>}
      </div>
      {state === "on" && PUSH_KINDS.map((k) => (
        <div key={k.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5 pl-12">
          <span className="min-w-0 flex-1 self-center text-callout text-fg">{k.label}</span>
          <Switch label={k.label} checked={kinds.includes(k.id)} onChange={(v) => toggleKind(k.id, v)} />
        </div>
      ))}
      {dialog && <InstallDialog onClose={() => setDialog(false)} />}
    </Group>
  );
}
