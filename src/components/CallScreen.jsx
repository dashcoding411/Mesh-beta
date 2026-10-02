import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, SwitchCamera, Volume2, Minimize2, Maximize2, PictureInPicture2 } from "lucide-react";
import Avatar from "./ui/Avatar";
import { relayConfigured } from "../lib/calls";
import { endTone, startTone } from "../lib/callTones";
import { formatDuration } from "../lib/format";
import { useFocusTrap } from "../lib/useFocusTrap";

function useSession(session) {
  const [, force] = useState(0);
  useEffect(() => session.onChange(() => force((n) => n + 1)), [session]);
  return session;
}

// Reports autoplay rejection via onBlocked so the UI can offer a tap-to-play.
function StreamPlayer({ stream, kind = "video", muted = false, mirror = false, className = "", onBlocked, videoRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (videoRef) videoRef.current = el;
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play?.().then(() => onBlocked?.(false)).catch((err) => { if (err?.name === "NotAllowedError") onBlocked?.(true); });
  });
  if (kind === "audio") return <audio ref={ref} autoPlay className="hidden" />;
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${mirror ? "-scale-x-100" : ""} ${className}`} />;
}

function CallButton({ icon: Icon, label, onClick, tone = "neutral", pressed, small = false }) {
  const tones = {
    neutral: pressed ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
    danger: "bg-red-600 text-white hover:bg-red-700",
    accept: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  if (small) {
    return (
      <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
        className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon size={18} aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="flex flex-col items-center gap-2">
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
        className={`press flex h-16 w-16 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon size={26} aria-hidden="true" />
      </button>
      <span className="whitespace-nowrap text-caption text-white/80" aria-hidden="true">{label}</span>
    </span>
  );
}

const ENDED = {
  declined: "Declined",
  missed: "No answer",
  cancelled: "Call cancelled",
  busy: "On another call",
  ended: "Call ended",
};

// Full-screen call view, or a floating mini player so the rest of the app stays usable.
export function CallScreen({ session, onClose }) {
  useSession(session);
  const [now, setNow] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const rootRef = useRef(null);
  useFocusTrap({ ref: rootRef, active: !minimized, restore: false });
  const remoteVideoRef = useRef(null);
  const endBtn = useRef(null);
  const { state } = session;

  useEffect(() => {
    if (!session.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session.startedAt]);

  useEffect(() => { if (!minimized) endBtn.current?.focus(); }, [minimized]);

  useEffect(() => {
    if (state === "ringing" && session.isCaller) return startTone("ringback");
    if (state === "ended") endTone();
  }, [state, session.isCaller]);

  useEffect(() => {
    if (state !== "ended") return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [state, onClose]);

  useEffect(() => {
    if (minimized) return;
    const onKey = (e) => { if (e.key === "Escape") setMinimized(true); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimized]);

  const failed = relayConfigured()
    ? "Couldn't connect. Check your connection and try again."
    : "Couldn't connect. Some networks, like mobile data, block direct calls.";
  const status = {
    starting: "Starting…",
    ringing: "Ringing…",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    active: session.startedAt ? formatDuration(Math.floor(Math.max(0, (now || session.startedAt) - session.startedAt) / 1000)) : "Connected",
    ended: session.endedReason === "failed" ? failed : ENDED[session.endedReason] || "Call ended",
  }[state];

  const live = state !== "ended";
  const connected = state === "active" || state === "reconnecting";
  const remoteVideo = session.remoteStream.getVideoTracks()[0];
  const showRemoteVideo = connected && !!remoteVideo && !remoteVideo.muted && !session.remoteCameraOff;
  const localVideo = live && session.hasCamera && !session.cameraOff;
  const localFull = localVideo && !showRemoteVideo && !session.startedAt;
  const videoCall = showRemoteVideo || localVideo;

  const toggleCamera = async () => {
    setCameraError(false);
    if (!(await session.toggleCamera())) setCameraError(true);
  };
  const retryAudio = async () => {
    const players = [...(rootRef.current?.querySelectorAll("audio, video") || [])];
    const ok = await Promise.all(players.map((el) => el.play().then(() => true, () => false)));
    if (ok.every(Boolean)) setSoundBlocked(false);
  };
  const pip = async () => {
    try { await remoteVideoRef.current?.requestPictureInPicture(); } catch { /* unsupported or denied */ }
  };
  const canPip = showRemoteVideo && typeof document !== "undefined" && document.pictureInPictureEnabled;
  const cameraLabel = localVideo ? "Camera off" : "Camera on";

  const audio = live && <StreamPlayer kind="audio" stream={session.remoteStream} onBlocked={setSoundBlocked} />;

  if (minimized) {
    return createPortal(
      <div ref={rootRef} role="region" aria-label={`Call with @${session.peer.username}`} data-theme="dark"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-toast w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-card bg-zinc-900 text-white shadow-overlay anim-rise md:bottom-6 md:right-6">
        {audio}
        {showRemoteVideo && (
          <button type="button" onClick={() => setMinimized(false)} aria-label="Expand call" className="relative block aspect-video w-full bg-black">
            <StreamPlayer stream={session.remoteStream} muted videoRef={remoteVideoRef} className="h-full w-full object-cover" />
            {localVideo && (
              <StreamPlayer stream={session.localStream} muted mirror={session.facing === "user"}
                className="absolute bottom-2 right-2 h-16 w-12 rounded-control object-cover ring-1 ring-white/30" />
            )}
          </button>
        )}
        <div className="flex items-center gap-2.5 p-2.5">
          {!showRemoteVideo && <Avatar profile={session.peer} size={40} />}
          <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-callout font-semibold">@{session.peer.username}</span>
            <span role="status" aria-live="polite" className="block truncate text-caption text-white/70 tabular">
              {session.remoteMuted && live ? "Muted · " : ""}{status}
            </span>
          </button>
          {live && (
            <>
              <CallButton small icon={session.muted ? MicOff : Mic} label={session.muted ? "Unmute" : "Mute"} pressed={session.muted} onClick={() => session.toggleMute()} />
              <CallButton small icon={Maximize2} label="Expand call" onClick={() => setMinimized(false)} />
              <CallButton small icon={PhoneOff} label="End call" tone="danger" onClick={() => session.hangUp()} />
            </>
          )}
        </div>
        {live && soundBlocked && (
          <button type="button" onClick={retryAudio} className="flex w-full items-center justify-center gap-2 bg-white py-2 text-callout font-semibold text-black">
            <Volume2 size={16} aria-hidden="true" /> Tap to hear them
          </button>
        )}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={`${videoCall ? "Video" : "Voice"} call with @${session.peer.username}`} data-theme="dark"
      className="fixed inset-0 z-toast flex flex-col bg-zinc-950 text-white anim-fade">
      {audio}
      {showRemoteVideo && <StreamPlayer stream={session.remoteStream} muted videoRef={remoteVideoRef} className="absolute inset-0 h-full w-full object-cover" />}
      {localFull && <StreamPlayer stream={session.localStream} muted mirror={session.facing === "user"} className="absolute inset-0 h-full w-full object-cover opacity-60" />}

      <div className="relative z-20 flex items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button type="button" onClick={() => setMinimized(true)} aria-label="Minimise call"
          className="press flex h-11 items-center gap-2 rounded-full bg-black/40 px-3 text-callout font-semibold backdrop-blur-sm hover:bg-black/60">
          <Minimize2 size={18} aria-hidden="true" /> <span className="hidden sm:inline">Minimise</span>
        </button>
        {canPip && (
          <button type="button" onClick={pip} aria-label="Picture in picture"
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60">
            <PictureInPicture2 size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        {!showRemoteVideo && <Avatar profile={session.peer} size={120} />}
        <p className="text-title-1 font-display drop-shadow">@{session.peer.username}</p>
        <p role="status" aria-live="polite" className="max-w-xs text-body text-white/80 tabular drop-shadow">{status}</p>
        {live && session.remoteMuted && (
          <p className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-caption text-white/90"><MicOff size={14} aria-hidden="true" /> Muted</p>
        )}
        {live && cameraError && (
          <p className="rounded-full bg-black/50 px-3 py-1 text-caption text-white/90">Couldn&apos;t start the camera. Check the browser&apos;s camera permission.</p>
        )}
        {live && soundBlocked && (
          <button type="button" onClick={retryAudio}
            className="press flex items-center gap-2 rounded-full bg-white px-4 py-2 text-callout font-semibold text-black">
            <Volume2 size={18} aria-hidden="true" /> Tap to hear them
          </button>
        )}
      </div>

      {localVideo && !localFull && (
        <StreamPlayer stream={session.localStream} muted mirror={session.facing === "user"}
          className="absolute right-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-20 h-44 w-28 rounded-card object-cover shadow-overlay md:h-56 md:w-40" />
      )}

      {live && (
        <div className="relative z-10 flex justify-center gap-6 px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <CallButton icon={session.muted ? MicOff : Mic} label={session.muted ? "Unmute" : "Mute"} pressed={session.muted} onClick={() => session.toggleMute()} />
          <CallButton icon={localVideo ? Video : VideoOff} label={cameraLabel} pressed={!localVideo} onClick={toggleCamera} />
          {localVideo && session.canFlip && (
            <CallButton icon={SwitchCamera} label="Flip" onClick={() => session.flipCamera()} />
          )}
          <span ref={endBtn} tabIndex={-1} className="outline-none">
            <CallButton icon={PhoneOff} label="End" tone="danger" onClick={() => session.hangUp()} />
          </span>
        </div>
      )}
    </div>,
    document.body
  );
}

export function IncomingCall({ call, onAnswer, onDecline }) {
  const answerRef = useRef(null);
  const trap = useFocusTrap({ restore: false });
  useEffect(() => {
    answerRef.current?.focus();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    const stop = startTone("ring");
    const title = document.title;
    document.title = `Call from @${call.callerName} · Mesh`;
    return () => { stop(); navigator.vibrate?.(0); document.title = title; };
  }, [call.callerName]);
  return createPortal(
    <div ref={trap} role="alertdialog" aria-modal="true" aria-label={`Incoming ${call.video ? "video" : "voice"} call from @${call.callerName}`} data-theme="dark"
      className="fixed inset-0 z-toast flex flex-col items-center justify-between bg-zinc-950 px-6 py-16 text-white anim-fade">
      <div className="flex flex-col items-center gap-4 pt-safe text-center">
        <Avatar profile={{ username: call.callerName, photoURL: call.callerPhoto }} size={120} />
        <p className="text-title-1 font-display">@{call.callerName}</p>
        <p className="text-body text-white/80">Incoming {call.video ? "video" : "voice"} call…</p>
      </div>
      <div className="flex gap-16 pb-safe">
        <CallButton icon={PhoneOff} label="Decline" tone="danger" onClick={onDecline} />
        <span ref={answerRef} tabIndex={-1} className="outline-none">
          <CallButton icon={call.video ? Video : Phone} label="Answer" tone="accept" onClick={onAnswer} />
        </span>
      </div>
    </div>,
    document.body
  );
}
