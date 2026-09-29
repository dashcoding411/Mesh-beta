import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import MediaImg from "./MediaImg";

/* A photo on its own, as large as the screen allows. Escape, the close
   button or a tap on the dark area closes it, and focus goes back to
   whatever opened it. The description is one tap away for anyone who
   wants to read it, not only screen reader users. Pinch zoom is the
   browser's own, so it works however the phone is set up. */
export default function Lightbox({ src, alt, caption, onClose }) {
  const closeRef = useRef(null);
  const [showAlt, setShowAlt] = useState(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); }
      // Keep Tab inside: the only controls are here.
      if (e.key === "Tab") {
        const items = [...document.querySelectorAll("[data-lightbox] button")];
        const i = items.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
        e.preventDefault();
        items[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div data-lightbox data-theme="dark" role="dialog" aria-modal="true" aria-label={alt ? `Photo: ${alt}` : "Photo"}
      className="fixed inset-0 z-toast flex flex-col bg-black/95 anim-fade"
      onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset.backdrop) onClose(); }}>
      <div className="flex h-14 shrink-0 items-center justify-end gap-2 px-2 pt-safe">
        {alt && (
          <button type="button" onClick={() => setShowAlt((v) => !v)} aria-pressed={showAlt}
            className="press min-h-9 rounded-full bg-white/15 px-3 text-label font-bold tracking-wide text-white hover:bg-white/25">
            ALT
          </button>
        )}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15">
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <div data-backdrop="1" className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        <MediaImg src={src} alt={alt || ""} className="max-h-full max-w-full select-none object-contain"
          placeholderClass="h-64 w-64 rounded-card" />
      </div>
      {(showAlt || caption) && (
        <div className="max-h-[35vh] shrink-0 overflow-y-auto border-t border-white/10 px-4 py-3 pb-safe text-callout text-white/90">
          {showAlt ? <p><span className="font-semibold text-white">Description: </span>{alt}</p> : <p className="line-clamp-3">{caption}</p>}
        </div>
      )}
    </div>,
    document.body,
  );
}
