import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// Detects a newer deployed build (on focus and every 10 minutes) and offers a reload.

const CHECK_MS = 10 * 60 * 1000;
const ENTRY = /\/assets\/index-[\w-]+\.js/;

// Entry script of the running build; absent in dev.
const running = typeof document !== "undefined"
  ? document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute("src")?.match(ENTRY)?.[0]
  : null;

async function latest() {
  const html = await fetch("/", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  return html.match(ENTRY)?.[0] || null;
}

// A page's code is gone from the server after a deploy: reload into the new
// build. Not twice within a minute, so a file that's really missing can't
// loop; that case reaches ErrorBoundary, which offers the reload instead.
const RELOADED_KEY = "mesh:reloaded-for-update";
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    try {
      if (Date.now() - (Number(sessionStorage.getItem(RELOADED_KEY)) || 0) < 60_000) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
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
    const timer = setInterval(onShow, CHECK_MS);
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
