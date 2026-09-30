import { BrickWall, MessageCircle, SlidersHorizontal } from "lucide-react";
import { SECTIONS } from "../lib/brick";
import { navigate } from "../lib/router";
import Button from "./ui/Button";
import { whenLabel, spanLabel } from "../lib/format";

export default function LockScreen({ section, lock, opensAt, now, parentName, compact = false }) {
  const label = SECTIONS.find((s) => s.id === section)?.label || "This";
  const title = lock.reason === "cap"
    ? `That's your ${lock.cap} minutes of ${label} today`
    : lock.reason === "instant" ? "Mesh is bricked" : "Bricked for now";
  const body = lock.reason === "cap"
    ? `${label} opens again at midnight. Everything else is still open.`
    : lock.reason === "instant"
      ? `Until ${whenLabel(lock.until, now)}. Messages and calls still work.`
      : `This is one of your scheduled times. Messages and calls still work.`;

  return (
    <div role="status" className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-10" : "min-h-0 flex-1 py-16"} anim-fade`}>
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent-text">
        <BrickWall size={30} aria-hidden="true" />
      </span>
      <h2 className="text-title-2">{title}</h2>
      <p className="mt-2 max-w-sm text-callout text-fg-muted">{body}</p>
      {opensAt && opensAt > now && (
        <p className="mt-4 rounded-full bg-surface-2 px-4 py-1.5 text-callout font-semibold tabular">
          Opens {whenLabel(opensAt, now)} · in {spanLabel(opensAt - now)}
        </p>
      )}
      {opensAt === null && <p className="mt-4 text-caption text-fg-subtle">Locked for more than a week.</p>}
      {lock.by === "parent" && (
        <p className="mt-3 text-caption text-fg-subtle">This limit was set by @{parentName || "your parent"}. You can ask them to change it.</p>
      )}
      {!compact && (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" icon={MessageCircle} onClick={() => navigate("/messages")}>Open Messages</Button>
          <Button icon={SlidersHorizontal} onClick={() => navigate("/account/brick")}>Your limits</Button>
        </div>
      )}
    </div>
  );
}
