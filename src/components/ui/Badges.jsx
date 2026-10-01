import { FlaskConical } from "lucide-react";

// Badges admins award on profiles (users/{uid}.badges). Beta testers helped
// shape Mesh before launch, so theirs stands out.
const BADGES = {
  beta: { label: "Beta tester", description: "Helped test Mesh before launch" },
};

const GLOW = "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_12px_rgb(217_70_239_/_0.35)]";

/** Full badges, for profile headers. */
export function ProfileBadges({ badges }) {
  if (!badges?.includes("beta")) return null;
  return (
    <span title={BADGES.beta.description}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label font-semibold ${GLOW}`}>
      <FlaskConical size={12} aria-hidden="true" /> {BADGES.beta.label}
    </span>
  );
}

/** A small mark beside a name, for posts. */
export function BadgeMark({ badges }) {
  if (!badges?.includes("beta")) return null;
  return (
    <span title={BADGES.beta.label} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${GLOW}`}>
      <FlaskConical size={10} strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{BADGES.beta.label}</span>
    </span>
  );
}
