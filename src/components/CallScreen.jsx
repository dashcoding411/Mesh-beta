import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, SwitchCamera, Volume2 } from "lucide-react";
import Avatar from "./ui/Avatar";
import { relayConfigured } from "../lib/calls";
import { endTone, startTone } from "../lib/callTones";
import { formatDuration } from "../lib/format";

function useSession(session) {
  const [, force] = useState(0);
  useEffect(() => session.onChange(() => force((n) => n + 1)), [session]);
  return session;
}

// Reports autoplay rejection via onBlocked so the UI can offer a tap-to-play.
function StreamPlayer({ stream, kind = "video", muted = false, mirror = false, className = "", onBlocked }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play?.().then(() => onBlocked?.(false)).catch((err) => { if (err?.name === "NotAllowedError") onBlocked?.(true); });
  });
  if (kind === "audio") return <audio ref={ref} autoPlay className="hidden" />;
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${mirror ? "-scale-x-100" : ""} ${className}`} />;
}

function CallButton({ icon: Icon, label, onClick, tone = "neutral", pressed }) {
  const tones = {
    neutral: pressed ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
    danger: "bg-red-600 text-white hover:bg-red-700",
    accept: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
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

export function CallScreen({ session, onClose }) {
  useSession(session);
  const [now, setNow] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const endBtn = useRef(null);
  const { state } = session;

  useEffect(() => {
    if (!session.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session.startedAt]);

  useEffect(() => { endBtn.current?.focus(); }, []);

  useEffect(() => {
    if (state === "ringing" && session.isCaller) return startTone("ringback");
    if (state === "ended") endTone();
  }, [state, session.isCaller]);

  useEffect(() => {
    if (state !== "ended") return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [state, onClose]);

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

  const remoteVideo = session.remoteStream.getVideoTracks()[0];
  const showRemoteVideo = session.video && !!remoteVideo && !session.remoteCameraOff && (state === "active" || state === "reconnecting");
  const live = state !== "ended";
  const localVideo = session.video && session.localStream && !session.cameraOff && live;
  // Full-screen self view until connected.
  const localFull = localVideo && !showRemoteVideo && !session.startedAt;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${session.video ? "Video" : "Voice"} call with @${session.peer.username}`} data-theme="dark"
      className="fixed inset-0 z-toast flex flex-col bg-zinc-950 text-white anim-fade">
      {/* Remote audio plays here; the <video> stays muted. */}
      {live && <StreamPlayer kind="audio" stream={session.remoteStream} onBlocked={setSoundBlocked} />}
      {showRemoteVideo && <StreamPlayer stream={session.remoteStream} muted className="absolute inset-0 h-full w-full object-cover" />}
      {localFull && <StreamPlayer stream={session.localStream} muted mirror={session.facing === "user"} className="absolute inset-0 h-full w-full object-cover opacity-60" />}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-safe text-center">
        {!showRemoteVideo && <Avatar profile={session.peer} size={120} />}
        <p className="text-title-1 font-display drop-shadow">@{session.peer.username}</p>
        <p role="status" aria-live="polite" className="max-w-xs text-body text-white/80 tabular drop-shadow">{status}</p>
        {live && session.remoteMuted && (
          <p className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-caption text-white/90"><MicOff size={14} aria-hidden="true" /> Muted</p>
        )}
        {live && session.noCamera && (
          <p className="rounded-full bg-black/50 px-3 py-1 text-caption text-white/90">No camera available, so they'll hear you but not see you.</p>
        )}
        {live && soundBlocked && (
          <button type="button"
            onClick={async () => {
              const players = [...document.querySelectorAll("[role=dialog] audio, [role=dialog] video")];
              const ok = await Promise.all(players.map((el) => el.play().then(() => true, () => false)));
              if (ok.every(Boolean)) setSoundBlocked(false);
            }}
            className="press flex items-center gap-2 rounded-full bg-white px-4 py-2 text-callout font-semibold text-black">
            <Volume2 size={18} aria-hidden="true" /> Tap to hear them
          </button>
        )}
      </div>

      {localVideo && !localFull && (
        <StreamPlayer stream={session.localStream} muted mirror={session.facing === "user"}
          className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 h-44 w-28 rounded-card object-cover shadow-overlay md:h-56 md:w-40" />
      )}

      {live && (
        <div className="relative z-10 flex justify-center gap-6 px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <CallButton icon={session.muted ? MicOff : Mic} label={session.muted ? "Unmute" : "Mute"} pressed={session.muted} onClick={() => session.toggleMute()} />
          {session.video && !session.noCamera && (
            <CallButton icon={session.cameraOff ? VideoOff : Video} label={session.cameraOff ? "Camera on" : "Camera off"} pressed={session.cameraOff} onClick={() => session.toggleCamera()} />
          )}
          {session.video && session.canFlip && !session.cameraOff && (
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
  useEffect(() => {
    answerRef.current?.focus();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    const stop = startTone("ring");
    const title = document.title;
    document.title = `Call from @${call.callerName} · Mesh`;
    return () => { stop(); navigator.vibrate?.(0); document.title = title; };
  }, [call.callerName]);
  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-label={`Incoming ${call.video ? "video" : "voice"} call from @${call.callerName}`} data-theme="dark"
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
