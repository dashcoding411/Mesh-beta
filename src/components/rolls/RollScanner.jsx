import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CameraOff, X } from "lucide-react";
import { useCamera } from "../../lib/useCamera";
import { meshLink, qrReader } from "../../lib/qr";
import { navigate } from "../../lib/router";
import { shutterBuzz } from "../../lib/shutter";
import { useFocusTrap } from "../../lib/useFocusTrap";
import Button from "../ui/Button";
import { Spinner } from "../ui/States";

const SCAN_MS = 180;

/**
 * Join a roll by pointing the camera at its QR code (on the host's phone),
 * inside Mesh, so it opens where you're signed in. Nothing to type.
 */
export default function RollScanner({ onClose }) {
  const trap = useFocusTrap();
  const { videoRef, status, problem, retry } = useCamera({ facing: "environment" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (status !== "live") return undefined;
    let alive = true;
    let timer = 0;
    let last = "";
    (async () => {
      const read = await qrReader().catch(() => null);
      if (!alive) return;
      if (!read) { setNotice("This browser can't read QR codes. Close this and paste the invite link instead."); return; }
      const tick = async () => {
        const el = videoRef.current;
        const text = el?.videoWidth ? await read(el).catch(() => "") : "";
        if (!alive) return;
        const link = meshLink(text);
        if (link) {
          shutterBuzz();
          onClose();
          navigate(link.path);
          return;
        }
        if (text && text !== last) { last = text; setNotice("That QR code isn't a Mesh link. Try the one on the roll's Invite screen."); }
        timer = setTimeout(tick, SCAN_MS);
      };
      tick();
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [status, videoRef, onClose]);

  return createPortal(
    <div ref={trap} role="dialog" aria-modal="true" aria-label="Scan a roll's QR code"
      className="fixed inset-0 z-[55] flex flex-col bg-black text-white anim-fade">
      {/* Never hidden: iPhones may not play a hidden video. */}
      <video ref={videoRef} autoPlay muted playsInline aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-2 pb-6 pt-safe">
        <button type="button" onClick={onClose} aria-label="Close the scanner" className="press flex h-11 w-11 items-center justify-center rounded-full">
          <X size={24} aria-hidden="true" />
        </button>
        <p className="text-callout font-semibold">Scan to join a roll</p>
        <span className="w-11" />
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {status === "live" && (
          <span aria-hidden="true" className="relative h-64 w-64">
            {["left-0 top-0 border-l-4 border-t-4 rounded-tl-xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl",
              "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl"]
              .map((c) => <span key={c} className={`absolute h-10 w-10 border-white ${c}`} />)}
          </span>
        )}
        {status === "starting" && <span role="status" aria-label="Opening the camera"><Spinner /></span>}
        {(status === "denied" || status === "unavailable") && (
          <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
            <CameraOff size={32} aria-hidden="true" className="text-white/70" />
            <p className="text-title-3">{status === "denied" ? "Camera access is off" : "No camera here"}</p>
            <p className="text-callout text-white/70">
              {status === "denied"
                ? "Allow camera access for Mesh in your browser's settings to scan, or paste the invite link instead."
                : "This device can't open a camera here. Paste the invite link instead."}
            </p>
            {problem && <p className="text-caption text-white/50">Code: {problem}</p>}
            <Button onClick={retry}>Try again</Button>
          </div>
        )}
      </div>

      <div className="relative bg-gradient-to-t from-black/70 to-transparent px-6 pb-safe pt-8 text-center">
        <p className="pb-6 text-callout" aria-live="polite">
          {notice || "Point at the QR code on the host's phone. It's under Invite on their roll."}
        </p>
      </div>
    </div>,
    document.body,
  );
}
