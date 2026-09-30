import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/* A tab or home-screen app can run for days on the version of Mesh it
   opened with. When a newer one is out, this says so (checked when you come
   back to the app, and every ten minutes), because an old copy can't show
   things the new one sends, like a new kind of notification. */

const CHECK_MS = 10 * 60 * 1000;
const ENTRY = /\/assets\/index-[\w-]+\.js/;

// The script this page is running; missing in development, where there's nothing to check.
const running = typeof document !== "undefined"
  ? document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute("src")?.match(ENTRY)?.[0]
  : null;

async function latest() {
  const html = await fetch("/", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  return html.match(ENTRY)?.[0] || null;
}

// After a deploy the old version's files are gone, so opening a page it
// hadn't loaded yet fails. Reload into the new version instead (once, so a
// real outage can't loop).
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    try {
      if (sessionStorage.getItem("mesh:reloaded-for-update")) return;
      sessionStorage.setItem("mesh:reloaded-for-update", "1");
    } catch { /* storage blocked: reload anyway */ }
    e.preventDefault();
    window.location.reload();
  });
}

export default function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const check = async () => {
      const now = await latest();
      if (!stop && now && now !== running) setReady(true);
    };
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  if (!ready) return null;
  return (
    <div role="status" className="flex shrink-0 items-center gap-2.5 border-b border-line bg-accent-soft px-4 py-2 pt-safe text-caption text-fg md:px-6 anim-fade">
      <RefreshCw size={16} className="shrink-0 text-accent-text" aria-hidden="true" />
      <span className="min-w-0 flex-1">There&apos;s a new version of Mesh.</span>
      <button type="button" onClick={() => window.location.reload()}
        className="press min-h-8 shrink-0 rounded-full bg-accent px-3 text-caption font-semibold text-white">Reload</button>
    </div>
  );
}
