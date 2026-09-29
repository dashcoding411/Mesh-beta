import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { autoplayAllowed, useAppearance } from "../../lib/appearance";

/* A muted preview that plays only while it's on screen.

   - Phones have a handful of hardware decoders. Leaving the viewport tears
     the source down rather than pausing, so twenty previews never hold
     twenty decoders.
   - `start`/`length` loop a segment, that's how a long Flick's trailer
     plays without a second file.
   - With reduced motion, or autoplay turned off in Settings (to save
     mobile data), nothing plays until it's tapped.
   - It's muted, loops, and a tap pauses it, which satisfies WCAG 2.2.2
     (moving content longer than five seconds must be pausable). */
export default function InlineVideo({
  src, start = 0, length = 0, className = "", label = "Video", onOpen, onView, showMute = false, rounded = true,
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const autoplay = autoplayAllowed(useAppearance());
  const viewed = useRef(false);
  const onViewRef = useRef(onView);
  useEffect(() => { onViewRef.current = onView; });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio >= 0.6), { threshold: [0, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible) {
      if (!el.getAttribute("src")) {
        el.setAttribute("src", `${src}#t=${start}`);
        el.load();
      }
      if (autoplay) el.play().catch(() => {});
      // Counts as a view after two seconds on screen, not on a fly-past.
      if (!viewed.current && onViewRef.current) {
        const t = setTimeout(() => { viewed.current = true; onViewRef.current?.(); }, 2000);
        return () => clearTimeout(t);
      }
    } else {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [visible, src, start, autoplay]);

  const onTime = () => {
    const el = ref.current;
    if (el && length > 0 && el.currentTime >= start + length) el.currentTime = start;
  };

  const toggle = (e) => {
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  return (
    <div className={`group relative overflow-hidden bg-black ${rounded ? "rounded-card" : ""} ${className}`}>
      <video ref={ref} muted={muted} loop={!length} playsInline preload="none"
        aria-label={label}
        onTimeUpdate={onTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => { if (ref.current?.getAttribute("src")) setFailed(true); }}
        onClick={onOpen || toggle}
        className="h-full w-full cursor-pointer object-cover" />

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-caption text-fg-muted">
          This video couldn't load
        </div>
      ) : !playing && (
        <button type="button" onClick={toggle} aria-label={`Play ${label}`}
          className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
            <Play size={26} fill="currentColor" aria-hidden="true" />
          </span>
        </button>
      )}

      {showMute && !failed && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
          aria-label={muted ? "Unmute" : "Mute"} aria-pressed={!muted}
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
