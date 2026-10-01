import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { openNotice } from "../lib/notices";
import { NoticeAvatar, NoticeLine } from "./NoticeParts";

const SHOW_MS = 4500;

// A new notification drops in as a short banner, then goes. Only for ones that
// arrive during this visit, not from muted or blocked people, and not while
// the Notifications page is open.
export default function NotificationBanner({ notices, hidden, onNotificationsPage }) {
  const known = useRef(null);
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!notices) return;
    if (!known.current) {
      known.current = new Set(notices.map((n) => n.id));
      return;
    }
    const fresh = notices.filter((n) => !known.current.has(n.id) && !n.read && !hidden.has(n.actorId));
    notices.forEach((n) => known.current.add(n.id));
    if (fresh.length && !onNotificationsPage) setShown(fresh[0]);
  }, [notices, hidden, onNotificationsPage]);

  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-toast flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div role="status" key={shown.id}
        className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-2xl border border-line-strong bg-surface-2/95 py-2 pl-3 pr-1 shadow-overlay backdrop-blur anim-banner">
        <button type="button" onClick={() => { setShown(null); openNotice(shown); }}
          className="press flex min-w-0 flex-1 items-center gap-3 text-left">
          <NoticeAvatar n={shown} size={36} />
          <span className="line-clamp-2 text-callout text-fg-muted"><NoticeLine n={shown} /></span>
        </button>
        <button type="button" onClick={() => setShown(null)} aria-label="Dismiss"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:text-fg">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
