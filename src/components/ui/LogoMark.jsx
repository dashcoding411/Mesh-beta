import { useId } from "react";

// The Mesh mark and the loading screen built from it. Kept free of the rest
// of the app so the build can draw them into the HTML (scripts/prerender.mjs).

export function LogoMark({ size = 28 }) {
  // Unique gradient id per instance: a shared id breaks every copy when the
  // first one is inside a display:none subtree.
  const gradient = `mesh-mark-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#18181c" />
      <g stroke={`url(#${gradient})`} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M16 22h32M16 32h32M16 42h32" />
        <path d="M22 16v32M32 16v32M42 16v32" />
      </g>
    </svg>
  );
}

// The pulsing logo while Mesh (or a page it needs) loads.
export function Splash({ label = "Loading Mesh", children }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label={label}>
      <div className="animate-pulse"><LogoMark size={56} /></div>
      {children}
    </div>
  );
}
