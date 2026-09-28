import { useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { fetchInline, INLINE_PREFIX } from "../lib/media";

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const BARS = 40;

export function LiveBars({ levels }) {
  const bars = [...Array(Math.max(0, BARS - levels.length)).fill(0), ...levels];
  return (
    <span className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden="true">
      {bars.map((l, i) => (
        <span key={i} className="w-[3px] rounded-full bg-accent-text" style={{ height: `${Math.max(12, l * 100)}%`, opacity: l ? 1 : 0.3 }} />
      ))}
    </span>
  );
}

/* A voice message in the conversation. The audio loads on first play. */
export function VoiceNote({ chatId, voice, mine }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState("");
  const audio = useRef(null);
  const duration = voice.duration || 0;

  const toggle = async (e) => {
    e.stopPropagation();
    const el = audio.current;
    if (!src) {
      setLoading(true);
      try {
        const data = await fetchInline(INLINE_PREFIX + voice.mediaId, chatId);
        if (!data) throw new Error();
        setSrc(data);
        setLoading(false);
        requestAnimationFrame(() => { audio.current.playbackRate = rate; audio.current.play().catch(() => setError("Couldn't play")); });
      } catch {
        setLoading(false);
        setError("Voice message unavailable");
      }
      return;
    }
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  const cycleRate = (e) => {
    e.stopPropagation();
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const progress = duration ? Math.min(1, pos / duration) : 0;
  const peaks = voice.peaks?.length ? voice.peaks : Array(BARS).fill(30);
  const Icon = loading ? Loader2 : playing ? Pause : Play;

  return (
    <span className="flex min-w-[220px] items-center gap-2.5 py-1">
      <button type="button" onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} voice message, ${fmt(duration)}`}
        className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white text-violet-700" : "bg-accent text-white"}`}>
        <Icon size={18} fill={playing || loading ? "none" : "currentColor"} className={loading ? "animate-spin" : ""} aria-hidden="true" />
      </button>
      <span className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden="true">
        {peaks.map((p, i) => (
          <span key={i} className={`w-[3px] rounded-full ${i / peaks.length < progress ? (mine ? "bg-white" : "bg-accent-text") : mine ? "bg-white/45" : "bg-fg-subtle/60"}`}
            style={{ height: `${Math.max(12, p)}%` }} />
        ))}
      </span>
      <span className="w-9 shrink-0 text-right text-caption tabular opacity-90">{error ? "" : fmt(playing || pos ? pos : duration)}</span>
      <button type="button" onClick={cycleRate} aria-label={`Playback speed ${rate} times`}
        className={`press shrink-0 rounded-full px-1.5 text-label font-bold ${mine ? "bg-white/20" : "bg-surface-2"}`}>
        {rate}×
      </button>
      {error && <span className="sr-only" role="status">{error}</span>}
      {src && (
        <audio ref={audio} src={src} preload="auto"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPos(0); }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} />
      )}
    </span>
  );
}
