import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CameraOff, SwitchCamera, Volume2, VolumeX, X, Zap, ZapOff } from "lucide-react";
import { cameraSupported, openStream } from "../../lib/cameras";
import { centreCrop, developFrame, stampText, STAMP_COLOR } from "../../lib/digicam";
import SevenSeg from "./SevenSeg";
import { SHOTS_PER_PERSON, developLabel, queueShot } from "../../lib/data/rolls";
import { tsMillis } from "../../lib/db";
import { shutterBuzz, shutterClick, wakeShutter } from "../../lib/shutter";
import { useFocusTrap } from "../../lib/useFocusTrap";
import Button from "../ui/Button";
import { Spinner } from "../ui/States";
import { useToast } from "../ui/toast-context";

const ASPECT = 3 / 4; // portrait 4:3, like a compact held upright
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
  const [status, setStatus] = useState(() => (cameraSupported() ? "starting" : "unavailable"));
  const [facing, setFacing] = useState(() => read(FACING_KEY, "environment"));
  const [flash, setFlash] = useState(() => read(FLASH_KEY, "on") === "on");
  const [sound, setSound] = useState(() => read(SOUND_KEY, "on") === "on");
  const [cameras, setCameras] = useState(0);
  const [taken, setTaken] = useState(used);
  const [blink, setBlink] = useState(false); // the screen lighting a selfie
  const [shot, setShot] = useState(0); // shots this visit; each one replays the shutter
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const shutterRef = useRef(null);
  const trap = useFocusTrap();
  const left = Math.max(0, SHOTS_PER_PERSON - taken);
  const mirrored = facing === "user";

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!cameraSupported()) return undefined;
    let alive = true;
    openStream(facing, false, { width: { ideal: 2560 }, height: { ideal: 1920 } })
      .then(async (stream) => {
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) { el.srcObject = stream; await el.play().catch(() => {}); }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameras(devices.filter((d) => d.kind === "videoinput").length);
        setStatus("live");
        shutterRef.current?.focus();
      })
      .catch((err) => { if (alive) setStatus(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? "denied" : "unavailable"); });
    return () => { alive = false; stop(); };
  }, [facing, stop, attempt]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    write(FACING_KEY, next);
    setStatus("starting");
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
    const el = videoRef.current;
    if (status !== "live" || busy || left <= 0 || !el?.videoWidth) return;
    setBusy(true);
    shutterBuzz();
    if (sound) wakeShutter();
    try {
      if (flash) {
        if (mirrored) { setBlink(true); await new Promise((r) => setTimeout(r, 140)); }
        else if (await torch(true)) await new Promise((r) => setTimeout(r, 260));
      }
      const crop = centreCrop(el.videoWidth, el.videoHeight, ASPECT);
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
    <div ref={trap} role="dialog" aria-modal="true" aria-label={`Roll camera: ${roll.title}`}
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-[#0b0b0d] text-white anim-fade">
      <div className="flex w-full max-w-[min(100vw,calc((100dvh-190px)*0.75))] items-center justify-between px-3 pt-safe">
        <button type="button" onClick={onClose} aria-label="Close the camera" className="press flex h-11 w-11 items-center justify-center rounded-full">
          <X size={24} aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 truncate px-2 text-center text-callout font-semibold">{roll.title}</p>
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
      <div className="relative mt-2 aspect-[3/4] w-full max-w-[min(100vw,calc((100dvh-190px)*0.75))] overflow-hidden bg-black sm:rounded-[14px]">
        <video ref={videoRef} muted playsInline aria-hidden="true"
          className={`h-full w-full object-cover [filter:contrast(1.12)_saturate(1.22)] ${mirrored ? "-scale-x-100" : ""} ${status === "live" ? "" : "invisible"}`} />
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
            {status === "denied" && <Button onClick={() => { setStatus("starting"); setAttempt((n) => n + 1); }}>Try again</Button>}
          </div>
        )}

        {status === "live" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 font-mono text-[13px] font-semibold tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
            <span className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-[3px] border border-white/80 px-1 text-[11px] leading-4">AUTO</span>
              {flash ? <Zap size={14} fill="currentColor" /> : <ZapOff size={14} />}
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
        <p className="text-caption leading-tight text-white/60">Develops<br />{developLabel(tsMillis(roll.developAt))}</p>
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
