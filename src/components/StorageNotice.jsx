import { useState } from "react";

const KEY = "mesh:storage-notice";

/* Not a consent banner. Mesh sets no analytics or advertising storage, so
   there is no non-essential processing to ask permission for — and a banner
   whose only option is "OK" trains people to dismiss the ones that matter.
   What is owed here is disclosure, so this states what is stored, links to the
   detail, and goes away. If non-essential storage is ever added, this has to
   become a real opt-in with a working refusal. */
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
    <div role="status"
      className="fixed bottom-[70px] md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40
                 rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur p-4 shadow-xl anim-rise">
      <p className="text-sm text-zinc-200 leading-relaxed">
        Mesh keeps you signed in and rate-limits spam using your browser's storage. No analytics,
        no ad tracking, nothing shared with advertisers.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={close}
          className="min-h-[40px] rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
          Got it
        </button>
        <button onClick={() => { onReadMore(); close(); }}
          className="min-h-[40px] rounded-xl px-3 text-sm text-zinc-300 hover:text-white">
          Read the detail
        </button>
      </div>
    </div>
  );
}
