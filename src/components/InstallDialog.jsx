import { Share, SquarePlus, Smartphone } from "lucide-react";
import { installState, promptInstall } from "../lib/install";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { useToast } from "./ui/toast-context";

/** How to put Mesh on your home screen: the browser's prompt, or Safari's Share menu on iPhone. */
export default function InstallDialog({ onClose, reason }) {
  const toast = useToast();
  const state = installState();

  if (state === "prompt") {
    return (
      <Dialog title="Install Mesh" onClose={onClose} size="sm">
        <p className="text-callout text-fg-muted">
          {reason || "Mesh opens like an app from your home screen, full screen, and can send you notifications."}
        </p>
        <Button variant="primary" full icon={Smartphone} className="mt-4" onClick={async () => {
          const ok = await promptInstall();
          onClose();
          if (ok) toast({ title: "Mesh is installed", body: "Open it from your home screen." });
        }}>Install</Button>
      </Dialog>
    );
  }

  if (state === "ios") {
    return (
      <Dialog title="Add Mesh to your home screen" onClose={onClose} size="sm">
        <p className="text-callout text-fg-muted">
          {reason || "On iPhone, Mesh can only send notifications once it's on your home screen."}
        </p>
        <ol className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2"><Share size={18} aria-hidden="true" /></span>
            <span className="text-callout"><span className="font-semibold">Tap Share</span> at the bottom of Safari (in Chrome, it&apos;s at the top).</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2"><SquarePlus size={18} aria-hidden="true" /></span>
            <span className="text-callout">Scroll down and tap <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2"><Smartphone size={18} aria-hidden="true" /></span>
            <span className="text-callout">Open Mesh from your home screen, then turn on notifications in Settings.</span>
          </li>
        </ol>
        <Button full className="mt-5" onClick={onClose}>Got it</Button>
      </Dialog>
    );
  }

  return (
    <Dialog title="Install Mesh" onClose={onClose} size="sm">
      <p className="text-callout text-fg-muted">
        {state === "installed"
          ? "Mesh is already installed on this device."
          : "This browser doesn't offer installing. On a phone, open joinmesh.social in Chrome (Android) or Safari (iPhone)."}
      </p>
      <Button full className="mt-4" onClick={onClose}>OK</Button>
    </Dialog>
  );
}
