import { useState } from "react";
import { useMediaSrc } from "../../lib/media";

// Falls back to initials on missing or broken photos. alt="" because the name is always adjacent.
// Colour is derived from the name; white text meets 4.5:1 on each.
const TONES = ["bg-violet-700", "bg-sky-700", "bg-emerald-700", "bg-amber-700", "bg-rose-700", "bg-teal-700", "bg-indigo-700", "bg-slate-600"];
function toneFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export default function Avatar({ profile, size = 40, ring = false, className = "" }) {
  const [broken, setBroken] = useState(false);
  const src = useMediaSrc(profile?.photoURL);
  const name = profile?.name || profile?.username || "?";
  const initials = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
  const style = { width: size, height: size };
  const text = size >= 56 ? "text-title-3" : size >= 36 ? "text-callout" : "text-label";

  const face = src && !broken ? (
    <img src={src} alt="" onError={() => setBroken(true)} style={style}
      className="shrink-0 rounded-full bg-surface-2 object-cover" />
  ) : (
    <span aria-hidden="true" style={style}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${toneFor(profile?.username || name)} ${text}`}>
      {initials}
    </span>
  );

  if (!ring) return <span className={`inline-flex shrink-0 ${className}`}>{face}</span>;
  // ring="seen" is the grey ring of a story already watched.
  return (
    <span className={`inline-flex shrink-0 rounded-full p-[2px] ${ring === "seen" ? "bg-line-strong" : "bg-accent"} ${className}`}>
      <span className="rounded-full bg-canvas p-[2px]">{face}</span>
    </span>
  );
}
