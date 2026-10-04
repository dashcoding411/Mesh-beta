import { useState } from "react";
import { Aperture, X } from "lucide-react";
import { markRollSeen } from "../../lib/db";
import { navigate } from "../../lib/router";
import IconButton from "../ui/IconButton";

/** "Your roll developed": shown once, anywhere in Mesh, the first time you're back after 9am. */
export default function RollReady({ roll, onDone }) {
  const [gone, setGone] = useState(false);
  if (!roll || gone) return null;
  const close = () => { setGone(true); onDone?.(); };
  return (
    <aside aria-label="A roll has developed"
      className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-overlay flex items-center gap-1 rounded-card border border-line-strong bg-[#111114] py-2 pl-3 pr-1 text-white shadow-overlay anim-rise md:hidden">
      <button type="button" onClick={() => { close(); navigate(`/rolls/${roll.id}`); }} className="press flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ff9b2f] text-black"><Aperture size={22} aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block text-callout font-semibold">Your roll has developed</span>
          <span className="block truncate text-caption text-white/70">{roll.title} · {roll.photoCount} {roll.photoCount === 1 ? "photo" : "photos"}</span>
        </span>
      </button>
      <IconButton icon={X} label="Dismiss" tone="overlay" onClick={() => { markRollSeen(roll.id); close(); }} />
    </aside>
  );
}
