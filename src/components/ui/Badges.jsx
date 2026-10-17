import { BadgeCheck, Crown, FlaskConical, Gem, Sparkles } from "lucide-react";
import { tickOf } from "../../lib/badges";

// Profile badges (see lib/badges.js), highest first: someone holding several
// shows only the highest, so the founder is the Founder, not also a beta
// tester. The founders' shimmer (gold and silver); the queen's shimmers,
// glows and twinkles; beta testers' glows. Motion stops for people who
// reduce it. Only the rare ones (`everywhere`) show beside a name on posts
// and comments; the rest are on the profile only, so a badge by a name
// still means something.
const BADGES = [
  {
    id: "founder", label: "Founder", description: "Founded Mesh", icon: Crown, everywhere: true,
    className: "badge-shine bg-[linear-gradient(110deg,#d97706,#fbbf24_25%,#fef3c7_40%,#fbbf24_55%,#d97706_80%,#f59e0b)] text-amber-950 shadow-[0_0_14px_rgb(251_191_36_/_0.5)] ring-1 ring-amber-200/70",
  },
  {
    id: "cofounder", label: "Co-founder", description: "Co-founded Mesh", icon: Crown, everywhere: true,
    className: "badge-shine bg-[linear-gradient(110deg,#64748b,#cbd5e1_25%,#f8fafc_40%,#cbd5e1_55%,#64748b_80%,#94a3b8)] text-slate-900 shadow-[0_0_14px_rgb(203_213_225_/_0.45)] ring-1 ring-slate-100/70",
  },
  {
    id: "queen", label: "Queen", description: "Mesh royalty", icon: Gem, sparkle: true, everywhere: true,
    className: "badge-shine badge-glow bg-[linear-gradient(110deg,#f472b6,#fbcfe8_20%,#fde68a_38%,#f0abfc_56%,#fb7185_74%,#fbcfe8_88%,#f472b6)] text-rose-950 ring-1 ring-pink-100/80",
  },
  {
    id: "beta", label: "Beta tester", description: "Helped test Mesh before launch", icon: FlaskConical,
    className: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_12px_rgb(217_70_239_/_0.35)]",
  },
];

/** The tick by a verified account's name: purple (admin-verified, or a journalist) or the founder's pink one. */
export function VerifiedTick({ size = 16, className = "", decorative = false, pink = false, label = pink ? "Pink check" : "Verified" }) {
  return (
    <span title={decorative ? undefined : label} className={`inline-flex shrink-0 ${className}`}>
      <BadgeCheck size={size} strokeWidth={2.2} className={`${pink ? "fill-pink-500" : "fill-accent"} text-white`} aria-hidden="true" />
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}

const held = (badges) => BADGES.filter((b) => badges?.includes(b.id));

/** The highest badge someone holds, in full, for profile headers. */
export function ProfileBadges({ badges }) {
  const list = held(badges).slice(0, 1);
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map(({ id, label, description, icon: Icon, sparkle, className }) => (
        <span key={id} title={description}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label font-semibold ${className}`}>
          <Icon size={12} strokeWidth={2.4} aria-hidden="true" /> {label}
          {sparkle && <Sparkles size={11} strokeWidth={2.4} className="badge-twinkle" aria-hidden="true" />}
        </span>
      ))}
    </span>
  );
}

/** Beside a name, for posts and comments: the verified tick, then a founder's or the queen's badge. */
export function BadgeMark({ badges }) {
  const top = held(badges).find((b) => b.everywhere);
  const tick = tickOf(badges);
  if (!top && !tick) return null;
  const Icon = top?.icon;
  return (
    <>
      {tick && <VerifiedTick size={16} pink={tick === "pink"} />}
      {top && (
        <span title={top.label} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${top.className}`}>
          <Icon size={10} strokeWidth={2.6} aria-hidden="true" />
          <span className="sr-only">{top.label}</span>
        </span>
      )}
    </>
  );
}
