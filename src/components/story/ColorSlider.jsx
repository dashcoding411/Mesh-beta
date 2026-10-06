import { useRef } from "react";
import { SLIDER_GRADIENT, colorAt } from "../../lib/storyCanvas";

/** Snapchat's colour picker: a tall rainbow strip you slide a finger along. `value` runs 0 (white) to 1 (black). */
export default function ColorSlider({ value, onChange, className = "" }) {
  const bar = useRef(null);
  const pick = (e) => {
    const r = bar.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div ref={bar} role="slider" tabIndex={0} aria-label="Colour" aria-orientation="vertical"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={value < 0.05 ? "White" : value > 0.95 ? "Black" : "Colour"}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") pick(e); }}
        onKeyDown={(e) => {
          const step = { ArrowUp: -0.03, ArrowDown: 0.03, Home: -1, End: 1 }[e.key];
          if (step === undefined) return;
          e.preventDefault();
          onChange(Math.max(0, Math.min(1, value + step)));
        }}
        className="relative h-56 w-3.5 cursor-pointer rounded-full ring-2 ring-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        style={{ background: SLIDER_GRADIENT, touchAction: "none" }}>
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-lg"
          style={{ top: `${value * 100}%`, background: colorAt(value) }} />
      </div>
    </div>
  );
}
