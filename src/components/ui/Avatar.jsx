import { useState } from "react";

/* Initials on a gradient when there's no photo, or when the photo fails to
   load, which is the case people forget. alt="" on purpose: an avatar always
   sits beside the name it belongs to, so describing it would make a screen
   reader say the name twice. */
export default function Avatar({ profile, size = 40, ring = false, className = "" }) {
  const [broken, setBroken] = useState(false);
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

  const face = profile?.photoURL && !broken ? (
    <img src={profile.photoURL} alt="" onError={() => setBroken(true)} style={style}
      className="shrink-0 rounded-full bg-surface-2 object-cover" />
  ) : (
    <span aria-hidden="true" style={style}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-700 font-semibold text-white ${text}`}>
      {initials}
    </span>
  );

  if (!ring) return <span className={`inline-flex shrink-0 ${className}`}>{face}</span>;
  return (
    <span className={`inline-flex shrink-0 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 p-[2px] ${className}`}>
      <span className="rounded-full bg-canvas p-[2px]">{face}</span>
    </span>
  );
}
