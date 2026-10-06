import { CircleHelp } from "lucide-react";
import { navigate } from "../../lib/router";

/** A small link to a Help guide (lib/helpGuides.js), for pages that need a little explaining. */
export default function HelpLink({ guide, children, className = "" }) {
  return (
    <button type="button" onClick={() => navigate(`/help/${guide}`)}
      className={`press inline-flex min-h-9 items-center gap-1.5 rounded-full text-caption font-semibold text-accent-text hover:underline ${className}`}>
      <CircleHelp size={15} aria-hidden="true" /> {children}
    </button>
  );
}
