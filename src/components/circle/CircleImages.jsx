import { coverClass, initialsOf, LATTICE } from "../../lib/covers";
import MediaImg from "../ui/MediaImg";

/* A circle's photo, or its initials on its colour when it has none. */
export function CircleAvatar({ group, size = 64, className = "" }) {
  const box = { width: size, height: size };
  if (group.photoUrl) {
    return (
      <span aria-hidden="true" className={`block shrink-0 overflow-hidden rounded-control bg-surface-2 ${className}`} style={box}>
        <MediaImg src={group.photoUrl} alt="" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...LATTICE, ...box, fontSize: Math.round(size * 0.34) }}
      className={`flex shrink-0 items-center justify-center rounded-control font-display font-bold text-white ${coverClass(group.coverColor)} ${className}`}>
      {initialsOf(group.name)}
    </span>
  );
}

/* The banner across the top of a circle: its photo, or its colour with the lattice. */
export function CircleBanner({ group, className = "", children }) {
  return (
    <div className={`relative overflow-hidden ${group.bannerUrl ? "bg-surface-2" : coverClass(group.coverColor)} ${className}`}
      style={group.bannerUrl ? undefined : LATTICE}>
      {group.bannerUrl && <MediaImg src={group.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" placeholderClass="absolute inset-0 h-full w-full" />}
      {children}
    </div>
  );
}
