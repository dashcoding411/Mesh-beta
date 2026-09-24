import { useState } from "react";
import { Cookie, X } from "lucide-react";
import Button from "./ui/Button";

const KEY = "mesh:storage-notice";

/* Not a consent banner. Mesh sets no analytics or advertising storage, so
   there's nothing non-essential to ask permission for, and a banner whose
   only button is "OK" trains people to dismiss the ones that matter. What's
   owed is disclosure: say what's stored, link to the detail, get out of the
   way. If non-essential storage is ever added, this has to become a real
   opt-in with a working refusal. */
export default function StorageNotice({ onReadMore }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
  });

  if (dismissed) return null;

  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode: it reappears, which is fine */ }
    setDismissed(true);
  };

  return (
    <aside aria-label="About storage on Mesh"
      className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-toast rounded-card border border-line-strong bg-surface-2 p-4 shadow-overlay anim-rise md:bottom-4 md:left-auto md:right-4 md:w-[380px]">
      <div className="flex gap-3">
        <Cookie size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-callout text-fg">
          Mesh uses your browser's storage to keep you signed in and stop spam. No analytics, no ad tracking, nothing
          shared with advertisers.
        </p>
        <button type="button" onClick={close} aria-label="Dismiss"
          className="press -mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex gap-2 pl-8">
        <Button size="sm" variant="primary" onClick={close}>Got it</Button>
        <Button size="sm" variant="ghost" onClick={() => { onReadMore(); close(); }}>What's stored</Button>
      </div>
    </aside>
  );
}
