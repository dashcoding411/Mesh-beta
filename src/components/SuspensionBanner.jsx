import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { fetchMySuspension, isSuspended, tsMillis } from "../lib/db";
import { fullTime } from "../lib/format";
import { BUSINESS } from "../legal/business";

/* A suspended account can still read. It's told plainly why, until when,
   and how to appeal, rather than finding out from a string of failed posts. */
export default function SuspensionBanner({ profile }) {
  const suspended = isSuspended(profile);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!suspended) return;
    let alive = true;
    fetchMySuspension().then((s) => { if (alive) setInfo(s); }).catch(() => {});
    return () => { alive = false; };
  }, [suspended]);
  if (!suspended) return null;
  const permanent = new Date(tsMillis(profile.suspendedUntil)).getFullYear() > 9000;
  return (
    <div role="status" className="flex shrink-0 gap-3 border-b border-line bg-danger/15 px-4 py-3 pt-safe text-callout md:px-6">
      <UserX size={18} className="mt-0.5 shrink-0 text-danger-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold text-fg">
          Your account is suspended {permanent ? "permanently" : `until ${fullTime(profile.suspendedUntil)}`}.
        </p>
        <p className="text-caption text-fg-muted">
          You can still browse, but you can't post, comment, message or create anything.
          {info?.reason ? ` Reason: ${info.reason}` : ""} If you think this is a mistake, email {BUSINESS.privacyEmail} to appeal.
        </p>
      </div>
    </div>
  );
}
