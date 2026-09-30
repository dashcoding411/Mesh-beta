import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineBanner() {
  const [state, setState] = useState(() => (typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"));

  useEffect(() => {
    let timer;
    const down = () => { clearTimeout(timer); setState("offline"); };
    const up = () => {
      setState((s) => (s === "offline" ? "back" : s));
      clearTimeout(timer);
      timer = setTimeout(() => setState("online"), 3000);
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);

  if (state === "online") return null;
  const offline = state === "offline";
  return (
    <div role="status"
      className={`flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-2 pt-safe text-caption md:px-6 anim-fade ${
        offline ? "bg-surface-2 text-fg-muted" : "bg-success-text/10 text-success-text"
      }`}>
      {offline ? <WifiOff size={16} className="shrink-0" aria-hidden="true" /> : <Wifi size={16} className="shrink-0" aria-hidden="true" />}
      <span>
        {offline
          ? "You're offline. New posts and messages will load when you're back, and anything you've typed stays here."
          : "Back online."}
      </span>
    </div>
  );
}
