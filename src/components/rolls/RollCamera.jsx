import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CameraOff, SwitchCamera, Volume2, VolumeX, X, Zap, ZapOff } from "lucide-react";
import { useCamera } from "../../lib/useCamera";
import { centreCrop, developFrame, stampText, STAMP_COLOR } from "../../lib/digicam";
import SevenSeg from "./SevenSeg";
import { SHOTS_PER_PERSON, developLabel, queueShot } from "../../lib/data/rolls";
import { tsMillis } from "../../lib/db";
import { shutterBuzz, shutterClick, startWhirr, wakeShutter } from "../../lib/shutter";
import { useFocusTrap } from "../../lib/useFocusTrap";
import Button from "../ui/Button";
import { Spinner } from "../ui/States";
import { useToast } from "../ui/toast-context";

const ASPECT = 3 / 4; // portrait 4:3, like a compact held upright
const SIZE = { width: { ideal: 2560 }, height: { ideal: 1920 } };
// Zoom like a compact's: up to 3x, driven by a slow motor (the whole range
// in about 3.6 seconds) that spins up, and on letting go coasts a little and
// eases to a stop, cropping the frame the way digicam zoom did. Its sound
// follows the same speed, frame by frame.
const MAX_ZOOM = 3;
const ZOOM_SPEED = 0.55; // x per second, at full speed
const SPIN_UP_MS = 300;
const EASE = 0.06; // within this much of where it's going, it slows
const COAST = 0.04; // how far it runs on after letting go
const FACING_KEY = "mesh:camera-facing";
const FLASH_KEY = "mesh:roll-flash";
const SOUND_KEY = "mesh:roll-sound";
const read = (k, fallback) => { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/**
 * The roll camera: a mid-2000s digicam screen. No preview after a shot, like
 * a disposable: each one is developed, checked and saved in the background,
 * and everyone sees them when the roll develops.
 */
export default function RollCamera({ roll, used, onClose, onShot }) {
  const toast = useToast();
  const [facing, setFacing] = useState(() => read(FACING_KEY, "environment"));
  const [flash, setFlash] = useState(() => read(FLASH_KEY, "on") === "on");
  const [sound, setSound] = useState(() => read(SOUND_KEY, "on") === "on");
  const [taken, setTaken] = useState(used);
  const [blink, setBlink] = useState(false); // the screen lighting a selfie
  const [shot, setShot] = useState(0); // shots this visit; each one replays the shutter
  const [busy, setBusy] = useState(false);
  const shutterRef = useRef(null);
  const trap = useFocusTrap();
  const left = Math.max(0, SHOTS_PER_PERSON - taken);
  const mirrored = facing === "user";

  const { videoRef, streamRef, status, problem, cameras, retry, frameReady } = useCamera({ facing, size: SIZE });
  useEffect(() => { if (status === "live") shutterRef.current?.focus(); }, [status]);

  // The zoom. It moves every frame, so it paints the viewfinder and the zoom
  // bar directly rather than through React; the motor runs toward a target
  // (the rocker's end while held, or wherever a pinch points) at one speed.
  const zoomRef = useRef(1);
  const targetRef = useRef(1);
  const motorRef = useRef(null); // { raf, sound, dir, released } while it runs
  const fillRef = useRef(null);
  const readoutRef = useRef(null);
  const hideRef = useRef(0);
  const pinchRef = useRef({ points: new Map(), from: 0, at: 1 });
  const [zooming, setZooming] = useState(false); // the zoom bar shows
  const paintZoom = useCallback((z) => {
    if (videoRef.current) videoRef.current.style.transform = `scale(${mirrored ? -z : z}, ${z})`;
    if (fillRef.current) fillRef.current.style.width = `${((z - 1) / (MAX_ZOOM - 1)) * 100}%`;
    if (readoutRef.current) readoutRef.current.textContent = `x${z.toFixed(1)}`;
  }, [videoRef, mirrored]);
  const stopMotor = useCallback(() => {
    const m = motorRef.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.sound.stop();
    motorRef.current = null;
    clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setZooming(false), 1500);
  }, []);
  const runMotor = () => {
    const gap0 = targetRef.current - zoomRef.current;
    if (motorRef.current || Math.abs(gap0) < 0.005) return;
    clearTimeout(hideRef.current);
    setZooming(true);
    const began = performance.now();
    let last = began;
    const step = (now) => {
      const m = motorRef.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const gap = targetRef.current - zoomRef.current;
      // How fast it's going (0 to 1): spinning up at the start, easing off
      // as it nears where it's going. The sound follows the same number.
      const pace = Math.min(1, (now - began) / SPIN_UP_MS) * Math.min(1, Math.abs(gap) / EASE);
      const z = zoomRef.current + Math.sign(gap) * Math.min(Math.abs(gap), ZOOM_SPEED * pace * dt);
      zoomRef.current = z;
      paintZoom(z);
      m.sound.speed(pace);
      if (gap) m.dir = Math.sign(gap);
      if (Math.abs(targetRef.current - z) < 0.004) { stopMotor(); return; }
      m.raf = requestAnimationFrame(step);
    };
    motorRef.current = {
      raf: requestAnimationFrame(step),
      sound: sound ? startWhirr({ out: gap0 < 0 }) : { speed() {}, stop() {} },
      dir: Math.sign(gap0),
      released: false,
    };
  };
  // A new camera starts wide, like switching a compact on.
  useEffect(() => {
    zoomRef.current = 1;
    targetRef.current = 1;
  }, [facing]);
  // Painted once the screen (and its zoom bar) is up, and after a flip.
  useEffect(() => { paintZoom(zoomRef.current); }, [status, facing, paintZoom]);
  useEffect(() => () => { stopMotor(); clearTimeout(hideRef.current); }, [stopMotor]);

  // The rocker: hold T to zoom in, W to zoom out; let go and it stops.
  const zoomTo = (dir) => {
    if (status !== "live") return;
    if (sound) wakeShutter(); // sound can only start inside a tap
    targetRef.current = dir > 0 ? MAX_ZOOM : 1;
    if (motorRef.current) motorRef.current.released = false;
    runMotor();
  };
  // Letting go: the lens runs on a touch and eases to a stop, once per press.
  const zoomStop = () => {
    const m = motorRef.current;
    if (!m) { targetRef.current = zoomRef.current; return; }
    if (m.released) return;
    m.released = true;
    targetRef.current = Math.min(MAX_ZOOM, Math.max(1, zoomRef.current + m.dir * COAST));
  };
  const rocker = (dir) => ({
    onPointerDown: (e) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* without it, sliding off the button stops it */ }
      zoomTo(dir);
    },
    onPointerUp: zoomStop,
    onPointerLeave: zoomStop,
    onPointerCancel: zoomStop,
    onLostPointerCapture: zoomStop,
    onKeyDown: (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); zoomTo(dir); } },
    onKeyUp: (e) => { if (e.key === "Enter" || e.key === " ") zoomStop(); },
    onContextMenu: (e) => e.preventDefault(),
    style: { touchAction: "none", WebkitTouchCallout: "none" },
  });
  // Pinching points the motor; it follows at its own pace.
  const pinch = {
    onPointerDown: (e) => {
      const p = pinchRef.current;
      p.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.points.size === 2) {
        const [a, b] = [...p.points.values()];
        p.from = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        p.at = targetRef.current;
        if (sound) wakeShutter();
      }
    },
    onPointerMove: (e) => {
      const p = pinchRef.current;
      if (!p.points.has(e.pointerId)) return;
      p.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.points.size !== 2 || status !== "live") return;
      const [a, b] = [...p.points.values()];
      targetRef.current = Math.min(MAX_ZOOM, Math.max(1, p.at * (Math.hypot(a.x - b.x, a.y - b.y) / p.from)));
      runMotor();
    },
    onPointerUp: (e) => pinchRef.current.points.delete(e.pointerId),
    onPointerCancel: (e) => pinchRef.current.points.delete(e.pointerId),
  };
  // Keyboard: hold + or - (the same as T and W).
  const onKey = {
    onKeyDown: (e) => {
      if (e.repeat || e.target.closest?.("input, textarea")) return;
      if (e.key === "+" || e.key === "=") zoomTo(1);
      else if (e.key === "-") zoomTo(-1);
    },
    onKeyUp: (e) => { if (["+", "=", "-"].includes(e.key)) zoomStop(); },
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    write(FACING_KEY, next);
    setFacing(next);
  };
  const toggleFlash = () => { write(FLASH_KEY, flash ? "off" : "on"); setFlash(!flash); };
  const toggleSound = () => { write(SOUND_KEY, sound ? "off" : "on"); setSound(!sound); };

  // The back camera's torch where the browser allows it; the screen lights a selfie.
  const torch = async (on) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.getCapabilities?.().torch) return false;
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
  };

  const shoot = async () => {
    if (status !== "live" || busy || left <= 0) return;
    // First, inside the tap: a stalled preview can only be restarted from one.
    const ready = frameReady();
    setBusy(true);
    shutterBuzz();
    if (sound) wakeShutter();
    try {
      const el = videoRef.current;
      if (!(await ready) || !el?.videoWidth) {
        toast({ tone: "error", title: "The camera isn't showing a picture yet", body: "Try again, or close the camera and open it again. No shot was used." });
        return;
      }
      if (flash) {
        if (mirrored) { setBlink(true); await new Promise((r) => setTimeout(r, 140)); }
        else if (await torch(true)) await new Promise((r) => setTimeout(r, 260));
      }
      // What the viewfinder shows: the 4:3 middle, narrowed by the zoom.
      const whole = centreCrop(el.videoWidth, el.videoHeight, ASPECT);
      const z = zoomRef.current;
      const w = Math.round(whole.w / z);
      const h = Math.round(whole.h / z);
      const crop = { x: Math.round(whole.x + (whole.w - w) / 2), y: Math.round(whole.y + (whole.h - h) / 2), w, h };
      // Grab the frame now; developing it can take a moment.
      const frame = document.createElement("canvas");
      frame.width = crop.w;
      frame.height = crop.h;
      frame.getContext("2d").drawImage(el, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      if (flash && !mirrored) torch(false);
      if (sound) shutterClick();
      setBlink(false);
      setShot((n) => n + 1);
      setTaken((n) => n + 1);
      onShot?.(1);
      const developed = await developFrame(frame, { x: 0, y: 0, w: crop.w, h: crop.h }, { flash, mirrored });
      queueShot(roll, developed, (err) => {
        setTaken((n) => Math.max(used, n - 1));
        onShot?.(-1);
        toast({ tone: "error", title: "A shot didn't save", body: err?.name === "UnsafeImageError" ? err.message : "You still have it to use." });
      });
    } catch {
      toast({ tone: "error", title: "Couldn't take that shot" });
    } finally {
      setBusy(false);
      setBlink(false);
      if (flash && !mirrored) torch(false);
    }
  };

  const today = stampText(new Date());

  return createPortal(
    <div ref={trap} role="dialog" aria-modal="true" aria-label={`Roll camera: ${roll.title}`} {...onKey}
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-[#0b0b0d] text-white anim-fade">
      <div className="flex w-full max-w-[min(100vw,calc((100dvh-190px)*0.75))] items-center justify-between px-3 pt-safe">
        <button type="button" onClick={onClose} aria-label="Close the camera" className="press flex h-11 w-11 items-center justify-center rounded-full">
          <X size={24} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="truncate text-callout font-semibold">{roll.title}</p>
          <p className="truncate text-caption text-white/60">Develops {developLabel(tsMillis(roll.developAt))}</p>
        </div>
        <div className="flex">
          <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Shutter sound on" : "Shutter sound off"}
            className={`press flex h-11 w-11 items-center justify-center rounded-full ${sound ? "text-white" : "text-white/70"}`}>
            {sound ? <Volume2 size={22} aria-hidden="true" /> : <VolumeX size={22} aria-hidden="true" />}
          </button>
          <button type="button" onClick={toggleFlash} aria-pressed={flash} aria-label={flash ? "Flash on" : "Flash off"}
            className={`press flex h-11 w-11 items-center justify-center rounded-full ${flash ? "text-[#ffd34d]" : "text-white/70"}`}>
            {flash ? <Zap size={22} fill="currentColor" aria-hidden="true" /> : <ZapOff size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* The digicam screen. */}
      <div {...pinch} style={{ touchAction: "none" }}
        className="relative mt-2 aspect-[3/4] w-full max-w-[min(100vw,calc((100dvh-190px)*0.75))] overflow-hidden bg-black sm:rounded-[14px]">
        {/* Never hidden: iPhones may not play a hidden video, which then stays black.
            Its scale (zoom, and the mirror for a selfie) is set by paintZoom. */}
        <video ref={videoRef} autoPlay muted playsInline aria-hidden="true"
          className={`h-full w-full object-cover ${flash ? "[filter:contrast(1.05)_saturate(1.05)]" : "[filter:contrast(0.94)_saturate(0.9)_sepia(0.06)]"}`} />
        {status === "starting" && <span className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Opening the camera"><Spinner /></span>}
        {(status === "denied" || status === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <CameraOff size={32} aria-hidden="true" className="text-white/70" />
            <p className="text-title-3">{status === "denied" ? "Camera access is off" : "No camera here"}</p>
            <p className="max-w-xs text-callout text-white/70">
              {status === "denied"
                ? "Rolls only use the camera, so allow camera access for Mesh in your browser's settings, then try again."
                : "Rolls only take photos with the camera, and this device or browser can't open one."}
            </p>
            {problem && <p className="text-caption text-white/50">Code: {problem}</p>}
            <Button onClick={retry}>Try again</Button>
          </div>
        )}

        {status === "live" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 font-mono text-[13px] font-semibold tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
            <span className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-[3px] border border-white/80 px-1 text-[11px] leading-4">AUTO</span>
              {flash ? <Zap size={14} fill="currentColor" /> : <ZapOff size={14} />}
            </span>
            {/* The zoom bar, while zooming and for a moment after. */}
            <span className={`absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 text-[11px] transition-opacity duration-300 ${zooming ? "opacity-100" : "opacity-0"}`}>
              W
              <span className="flex h-2.5 w-24 rounded-[2px] border border-white/90 p-px">
                <span ref={fillRef} className="block h-full bg-white/90" style={{ width: "0%" }} />
              </span>
              T
              <span ref={readoutRef} className="ml-1 w-9 text-[12px]" />
            </span>
            <span className="absolute right-3 top-3 flex items-center gap-1.5">
              <span className="text-[11px]">4:3</span>
              <span className="relative flex h-3 w-6 items-center rounded-[2px] border border-white/90 p-[1.5px] after:absolute after:-right-[3px] after:h-1.5 after:w-[2px] after:bg-white/90">
                <span className="h-full w-3/4 bg-white/90" />
              </span>
            </span>
            {/* Focus brackets: green for a moment as each shot is taken. */}
            <span key={shot} className={`absolute left-1/2 top-1/2 h-16 w-20 -translate-x-1/2 -translate-y-1/2 ${shot ? "af-lock" : ""}`}>
              {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"]
                .map((c) => <span key={c} className={`absolute h-3 w-3 border-white/90 ${c}`} />)}
            </span>
            {shot > 0 && (
              <span key={`taken-${shot}`} className="osd-taken absolute left-1/2 top-[calc(50%+3rem)] flex -translate-x-1/2 items-center gap-1 rounded-[3px] bg-black/45 px-2 py-0.5 text-[12px]">
                <Check size={14} strokeWidth={3} className="text-[#4ade80]" />TAKEN
              </span>
            )}
            <span className="absolute bottom-3 left-3 flex items-baseline gap-1">
              <span key={shot} className={`inline-block origin-bottom-left ${shot ? "anim-heart" : ""}`}>
                <SevenSeg text={String(left).padStart(2, "0")} height={22} color="#ffffff" />
              </span>
              <span className="text-[11px] text-white/80">left</span>
            </span>
            <span className="absolute bottom-3 right-3"><SevenSeg text={today} height={14} color={STAMP_COLOR} glow /></span>
          </div>
        )}
        {blink && <span className="pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}
        {shot > 0 && (
          <span key={shot} aria-hidden="true">
            <span className="shutter-top pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-black" />
            <span className="shutter-bottom pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-black" />
          </span>
        )}
        {left === 0 && status === "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-8 text-center">
            <p className="font-display text-title-1">That's your 27</p>
            <p className="mt-2 text-callout text-white/75">Everyone sees them when it develops {developLabel(tsMillis(roll.developAt))}.</p>
          </div>
        )}
      </div>

      <div className="grid w-full max-w-[min(100vw,calc((100dvh-190px)*0.75))] grid-cols-3 items-center px-6 pb-safe pt-5">
        <div role="group" aria-label="Zoom (hold)" className="flex h-11 w-[104px] select-none overflow-hidden rounded-full bg-white/15 font-mono text-[15px] font-bold">
          <button type="button" {...rocker(-1)} disabled={status !== "live"} aria-label="Zoom out (hold)"
            className="flex-1 active:bg-white/20 disabled:opacity-40">W</button>
          <span className="my-2.5 w-px bg-white/30" aria-hidden="true" />
          <button type="button" {...rocker(1)} disabled={status !== "live"} aria-label="Zoom in (hold)"
            className="flex-1 active:bg-white/20 disabled:opacity-40">T</button>
        </div>
        <button ref={shutterRef} type="button" onClick={shoot} disabled={status !== "live" || left <= 0}
          aria-label={left > 0 ? `Take a photo, ${left} left` : "No shots left"}
          className="press relative h-[76px] w-[76px] justify-self-center rounded-full border-[5px] border-white disabled:opacity-40">
          <span className={`absolute inset-[5px] rounded-full bg-white transition-transform ${busy ? "scale-90" : ""}`} aria-hidden="true" />
        </button>
        {cameras > 1 ? (
          <button type="button" onClick={flip} aria-label={`Switch to the ${facing === "user" ? "back" : "front"} camera`}
            className="press flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-white/15">
            <SwitchCamera size={22} aria-hidden="true" />
          </button>
        ) : <span />}
      </div>
      <p className="sr-only" aria-live="polite">{shot > 0 ? "Photo taken. " : ""}{left} shots left</p>
    </div>,
    document.body,
  );
}
