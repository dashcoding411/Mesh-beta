import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone } from "lucide-react";
import Avatar from "./ui/Avatar";

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function useSession(session) {
  const [, force] = useState(0);
  useEffect(() => session.onChange(() => force((n) => n + 1)), [session]);
  return session;
}

function StreamVideo({ stream, muted = false, mirror = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream; });
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
      <span className="text-caption text-white/80" aria-hidden="true">{label}</span>
    </span>
  );
}

/* The whole-screen call view. Audio calls show the other person's picture;
   video calls show their video full screen with yours in the corner. */
export function CallScreen({ session, onClose }) {
  useSession(session);
  const [now, setNow] = useState(0);
  const endBtn = useRef(null);

  useEffect(() => {
    if (!session.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session.startedAt]);

  useEffect(() => { endBtn.current?.focus(); }, []);

  useEffect(() => {
    if (session.state !== "ended") return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [session.state, onClose]);

  const status = {
    starting: "Starting…",
    ringing: "Ringing…",
    connecting: "Connecting…",
    active: session.startedAt ? fmt(Math.max(0, (now || session.startedAt) - session.startedAt) / 1000) : "Connected",
    ended: {
      declined: "Declined", missed: "No answer", cancelled: "Call cancelled", busy: "Busy",
      failed: "Couldn't connect. Some networks block direct calls.", ended: "Call ended",
    }[session.endedReason] || "Call ended",
  }[session.state];
  const hasRemoteVideo = session.video && session.remoteStream.getVideoTracks().length > 0 && session.state === "active";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${session.video ? "Video" : "Voice"} call with @${session.peer.username}`}
      className="fixed inset-0 z-toast flex flex-col bg-gradient-to-b from-violet-950 to-black text-white anim-fade">
      {hasRemoteVideo && <StreamVideo stream={session.remoteStream} className="absolute inset-0 h-full w-full object-cover" />}
      {!session.video && <audio ref={(el) => { if (el && el.srcObject !== session.remoteStream) el.srcObject = session.remoteStream; }} autoPlay />}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-safe text-center">
        {!hasRemoteVideo && <Avatar profile={session.peer} size={120} />}
        <p className="text-title-1 font-display drop-shadow">@{session.peer.username}</p>
        <p role="status" aria-live="polite" className="text-body text-white/80 tabular drop-shadow">{status}</p>
      </div>

      {session.video && session.localStream && !session.cameraOff && session.state !== "ended" && (
        <StreamVideo stream={session.localStream} muted mirror
          className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 h-44 w-28 rounded-card object-cover shadow-overlay md:h-56 md:w-40" />
      )}

      {session.state !== "ended" && (
        <div className="relative z-10 flex justify-center gap-6 px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <CallButton icon={session.muted ? MicOff : Mic} label={session.muted ? "Unmute" : "Mute"} pressed={session.muted} onClick={() => session.toggleMute()} />
          {session.video && (
            <CallButton icon={session.cameraOff ? VideoOff : Video} label={session.cameraOff ? "Camera on" : "Camera off"} pressed={session.cameraOff} onClick={() => session.toggleCamera()} />
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

/* Ringing: who's calling, and Answer / Decline. */
export function IncomingCall({ call, onAnswer, onDecline }) {
  const answerRef = useRef(null);
  useEffect(() => {
    answerRef.current?.focus();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    return () => navigator.vibrate?.(0);
  }, []);
  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-label={`Incoming ${call.video ? "video" : "voice"} call from @${call.callerName}`}
      className="fixed inset-0 z-toast flex flex-col items-center justify-between bg-gradient-to-b from-violet-950 to-black px-6 py-16 text-white anim-fade">
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
