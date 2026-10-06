import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CameraOff, Images, SwitchCamera, X } from "lucide-react";
import { cameraSupported, openStream } from "../lib/cameras";
import { motionReduced } from "../lib/appearance";
import { formatDuration } from "../lib/format";
import Button from "./ui/Button";
import { Spinner } from "./ui/States";
import PhotoEditor from "./PhotoEditor";
import { useFocusTrap } from "../lib/useFocusTrap";

const HOLD_MS = 280; // a press longer than this records
const MAX_VIDEO_S = 60;
const MAX_SIDE = 2160;
const FACING_KEY = "mesh:camera-facing";

const savedFacing = () => {
  try { return localStorage.getItem(FACING_KEY) || "environment"; } catch { return "environment"; }
};

const recorderType = () => ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
  .find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";

/**
 * Full-screen capture. Tap the shutter for a photo; hold it to record when
 * `video` is on (with `photo` off, a tap starts and stops recording). The
 * shutter, library and flip sit at the bottom, in reach of a thumb. After a
 * capture the preview offers `actions` ({ id, label, primary }) and calls
 * `onDone(id, file)`. `onLibrary(files)` takes library picks directly;
 * without it a pick goes to the preview like a capture. `onCapture(file)`
 * skips the preview: each capture or pick goes straight to it (the story
 * editor has its own).
 */
export default function Camera({ onClose, onDone, onLibrary, onCapture, actions, photo = true, video = false, title = "Camera" }) {
  const [status, setStatus] = useState(() => (cameraSupported() ? "starting" : "unavailable")); // starting | live | denied | unavailable
  const [facing, setFacing] = useState(savedFacing);
  const [cameras, setCameras] = useState(0);
  const [shot, setShot] = useState(null); // { file, url, kind }
  const [recording, setRecording] = useState(null); // { at }
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // With both on, Video mode lets a tap start and stop recording, for anyone
  // who can't press and hold.
  const [mode, setMode] = useState(photo ? "photo" : "video");
  const tapRecords = !photo || (video && mode === "video");
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const holdRef = useRef(null);
  const libraryRef = useRef(null);
  const shutterRef = useRef(null);
  const mirrored = facing === "user";
  const trap = useFocusTrap();

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // The stream runs while the viewfinder shows, and stops for the preview.
  useEffect(() => {
    if (shot) return undefined;
    if (!cameraSupported()) return undefined;
    let alive = true;
    openStream(facing, video && !!recorderType())
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
  }, [facing, shot, video, stop, attempt]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    try { localStorage.setItem(FACING_KEY, next); } catch { /* private mode */ }
    setStatus("starting");
    setFacing(next);
  };

  // What's in the viewfinder is what's kept: the frame is cropped to it.
  const takePhoto = () => {
    const el = videoRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!el?.videoWidth || !box) return;
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    const target = box.width / box.height;
    let sw = vw;
    let sh = vh;
    if (vw / vh > target) sw = vh * target; else sh = vw / target;
    const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    if (!motionReduced()) { setFlash(true); setTimeout(() => setFlash(false), 180); }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `mesh-${Date.now()}.jpg`, { type: "image/jpeg" });
      if (onCapture) { stop(); onCapture(file); return; }
      setShot({ file, url: URL.createObjectURL(file), kind: "image" });
    }, "image/jpeg", 0.92);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    const type = recorderType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      recorderRef.current = null;
      setRecording(null);
      const mime = (rec.mimeType || type || "video/webm").split(";")[0];
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) return;
      const file = new File([blob], `mesh-${Date.now()}.${mime.includes("mp4") ? "mp4" : "webm"}`, { type: mime });
      if (onCapture) { stop(); onCapture(file); return; }
      setShot({ file, url: URL.createObjectURL(file), kind: "video" });
    };
    rec.start(250);
    recorderRef.current = rec;
    setElapsed(0);
    setRecording({ at: Date.now() });
  };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };

  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => {
      const s = (Date.now() - recording.at) / 1000;
      setElapsed(s);
      if (s >= MAX_VIDEO_S) stopRecording();
    }, 200);
    return () => clearInterval(id);
  }, [recording]);

  // Pointer: tap for a photo, hold to record (or tap to start and stop in
  // Video mode). Keyboard: Enter or Space.
  const press = () => {
    if (status !== "live") return;
    if (recorderRef.current) return;
    if (video) holdRef.current = setTimeout(() => { holdRef.current = null; startRecording(); }, tapRecords ? 0 : HOLD_MS);
  };
  const release = () => {
    if (status !== "live") return;
    if (recorderRef.current) {
      // Tap to record: the press that started it doesn't stop it.
      if (tapRecords && Date.now() - (recording?.at || 0) < HOLD_MS) return;
      stopRecording();
      return;
    }
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
    if (!tapRecords) takePhoto();
  };
  const keyShutter = () => {
    if (status !== "live") return;
    if (!tapRecords) takePhoto();
    else if (recorderRef.current) stopRecording();
    else startRecording();
  };

  const retake = () => { if (cameraSupported()) setStatus("starting"); setShot(null); };
  const pickLibrary = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    if (onLibrary) { stop(); onLibrary(files); return; }
    const file = files[0];
    if (onCapture) { stop(); onCapture(file); return; }
    setShot({ file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" : "image" });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (shot) retake();
      else if (!recorderRef.current) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shot, onClose]);

  const accept = [photo && "image/*", video && "video/*"].filter(Boolean).join(",");
  const hint = recording ? `Recording · ${formatDuration(Math.floor(elapsed))}`
    : tapRecords ? "Tap to start recording" : video ? "Tap for a photo, hold for a video" : "Tap to take a photo";
  const ring = recording ? Math.min(1, elapsed / MAX_VIDEO_S) : 0;

  return createPortal(
    <div ref={trap} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[55] flex flex-col bg-black text-white anim-fade">
      {/* The viewfinder fills the screen (a tall frame on computers); controls float over it. */}
      <div ref={boxRef} className="relative mx-auto h-full w-full overflow-hidden md:aspect-[9/16] md:w-auto">
        {shot ? (
          shot.kind === "image"
            ? <PhotoEditor file={shot.file} actions={actions} onBack={retake} onDone={(id, file) => { stop(); onDone(id, file); }} />
            : <video src={shot.url} autoPlay loop playsInline className="h-full w-full object-contain" aria-label="Your video" />
        ) : (
          <video ref={videoRef} muted playsInline aria-hidden="true"
            className={`h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""} ${status === "live" ? "" : "invisible"}`} />
        )}
        {flash && <span className="pointer-events-none absolute inset-0 bg-white anim-fade" aria-hidden="true" />}

        {!shot && status === "starting" && (
          <span className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Opening the camera"><Spinner /></span>
        )}
        {!shot && (status === "denied" || status === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <CameraOff size={32} aria-hidden="true" className="text-white/70" />
            <p className="text-title-3">{status === "denied" ? "Camera access is off" : "No camera available"}</p>
            <p className="max-w-xs text-callout text-white/70">
              {status === "denied"
                ? "Allow camera access for Mesh in your browser's site settings, then try again. You can still choose from your library."
                : "This device or browser can't open a camera here. You can still choose from your library."}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" icon={Images} onClick={() => libraryRef.current?.click()}>Choose from library</Button>
              {status === "denied" && <Button onClick={() => { setStatus("starting"); setAttempt((n) => n + 1); }}>Try again</Button>}
            </div>
          </div>
        )}

        {shot?.kind !== "image" && <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-2 pb-6 pt-safe">
          {shot ? (
            <button type="button" onClick={retake} className="press flex min-h-11 items-center gap-1.5 rounded-full px-3 text-callout font-semibold">
              <ArrowLeft size={20} aria-hidden="true" /> Retake
            </button>
          ) : (
            <button type="button" onClick={onClose} disabled={!!recording} aria-label="Close camera"
              className="press flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40">
              <X size={24} aria-hidden="true" />
            </button>
          )}
          {recording && (
            <span className="mr-2 flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-label font-semibold tabular" role="status">
              <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" /> {formatDuration(Math.floor(elapsed))}
            </span>
          )}
        </div>}
      </div>

      {/* Thumb zone: everything you press lives down here, over the viewfinder. */}
      {shot?.kind !== "image" && <div className="absolute inset-x-0 bottom-0 mx-auto w-full bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-safe md:max-w-[56.25vh]">
        {shot ? (
          <div className="flex h-[142px] items-center justify-end gap-3">
            {actions.map((a) => (
              <Button key={a.id} variant={a.primary ? "primary" : "secondary"} size="lg"
                className={a.primary ? "min-w-32" : "!bg-white/15 !text-white"} onClick={() => { stop(); onDone(a.id, shot.file); }}>
                {a.label}
              </Button>
            ))}
          </div>
        ) : (
          <>
            {photo && video && !recording && (
              <div className="flex justify-center pt-3" role="radiogroup" aria-label="Camera mode">
                {["photo", "video"].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                    className={`min-h-8 rounded-full px-4 text-caption font-semibold ${mode === m ? "bg-white text-black" : "text-white/80"}`}>
                    {m === "photo" ? "Photo" : "Video"}
                  </button>
                ))}
              </div>
            )}
            <p className="h-[30px] pt-3 text-center text-caption text-white/80" aria-live="polite">{status === "live" ? hint : " "}</p>
            <div className="grid h-[112px] grid-cols-3 items-center">
              <button type="button" onClick={() => libraryRef.current?.click()} disabled={!!recording}
                aria-label="Choose from library"
                className="press flex h-12 w-12 items-center justify-center justify-self-start rounded-control bg-white/15 disabled:opacity-40">
                <Images size={22} aria-hidden="true" />
              </button>
              <button ref={shutterRef} type="button" disabled={status !== "live"}
                aria-label={recording ? "Stop recording" : tapRecords ? "Start recording" : video ? "Take a photo, or hold to record" : "Take a photo"}
                onPointerDown={press} onPointerUp={release} onPointerLeave={() => { if (recorderRef.current && !tapRecords) stopRecording(); else if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } }}
                onClick={(e) => { if (e.detail === 0) keyShutter(); }} onContextMenu={(e) => e.preventDefault()}
                style={{ WebkitTouchCallout: "none", touchAction: "none" }}
                className="relative h-[78px] w-[78px] select-none justify-self-center rounded-full disabled:opacity-40">
                <svg viewBox="0 0 78 78" className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle cx="39" cy="39" r="36" fill="none" stroke="white" strokeWidth="5" />
                  {recording && (
                    <circle cx="39" cy="39" r="36" fill="none" stroke="#dc2626" strokeWidth="5"
                      strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - ring)} strokeLinecap="round" />
                  )}
                </svg>
                <span className={`absolute rounded-full transition-all duration-standard ${recording ? "inset-[24px] rounded-[8px] bg-danger" : "inset-[9px] bg-white active:inset-[12px]"}`} aria-hidden="true" />
              </button>
              {cameras > 1 ? (
                <button type="button" onClick={flip} disabled={!!recording} aria-label={`Switch to the ${facing === "user" ? "back" : "front"} camera`}
                  className="press flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-white/15 disabled:opacity-40">
                  <SwitchCamera size={22} aria-hidden="true" />
                </button>
              ) : <span />}
            </div>
          </>
        )}
      </div>}
      <input ref={libraryRef} type="file" accept={accept} multiple={!!onLibrary && photo && !video} className="hidden"
        onChange={pickLibrary} aria-hidden="true" tabIndex={-1} />
    </div>,
    document.body,
  );
}
