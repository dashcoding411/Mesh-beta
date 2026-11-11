import { lazy, Suspense, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { blockFor, RULE_NAMES } from "../../lib/moderation";
import Button from "./Button";

// Shared loading, empty and error states.

export function Spinner({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`skeleton rounded-control ${className}`} />;
}

/** Screen-reader loading announcement; skeletons carry the visuals. */
export function Loading({ label = "Loading", children }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, compact = false, heading = false }) {
  // `heading`: this message is the whole page, so its title is the page's h1.
  const Title = heading ? "h1" : "p";
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-16"} px-6 anim-fade`}>
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
          <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      <Title className="text-title-3 text-fg">{title}</Title>
      {body && <p className="mt-2 max-w-xs text-callout text-fg-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, onRetry, compact = false }) {
  return (
    <div role="alert" className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-16"} px-6`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-danger-text">
        <AlertTriangle size={26} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-title-3 text-fg">{title}</p>
      <p className="mt-2 max-w-xs text-callout text-fg-muted">
        {body || "Check your connection and try again."}
      </p>
      {onRetry && (
        <Button className="mt-6" icon={RotateCw} onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

/** Inline form message with an icon, so colour isn't the only signal. */
// A hate-filter block names its rule and can be appealed to a person, from
// wherever the message shows.
const AppealDialog = lazy(() => import("../AppealDialog"));

export function InlineMessage({ tone = "error", children, id }) {
  const [appealing, setAppealing] = useState(false);
  if (!children) return null;
  const block = tone === "error" && typeof children === "string" ? blockFor(children) : null;
  const tones = {
    error: "text-danger-text",
    success: "text-success-text",
    warning: "text-warning-text",
    info: "text-fg-muted",
  };
  return (
    <p id={id} className={`flex items-start gap-1.5 text-caption ${tones[tone]}`}>
      {tone === "error" && <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
      <span>
        {children}
        {block && (
          <span className="mt-1 block text-fg-muted">
            Matched rule: {RULE_NAMES[block.rule] || block.rule}.{" "}
            <button type="button" onClick={() => setAppealing(true)} className="font-semibold text-accent-text underline underline-offset-2">
              Appeal to a person
            </button>
          </span>
        )}
      </span>
      {appealing && block && (
        <Suspense fallback={null}><AppealDialog block={block} onClose={() => setAppealing(false)} /></Suspense>
      )}
    </p>
  );
}
