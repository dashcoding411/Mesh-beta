import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import IconButton from "./IconButton";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openCount = 0;

/* Every overlay in Mesh goes through here, so every overlay behaves:

   - focus moves in on open, and returns to whatever opened it on close
   - Tab and Shift+Tab stay inside while it's open
   - Escape closes it, and so does the backdrop
   - the page behind stops scrolling
   - it's labelled by its own title for screen readers

   variant:
     sheet:  slides up from the bottom on phones, centred card on desktop
     center: centred card everywhere (confirmations)
     full:   takes the whole screen on phones, large card on desktop
     drawer: slides in from the left edge (the Home sidebar on phones) */
export default function Dialog({
  title, onClose, children, footer, variant = "sheet", size = "md",
  hideTitle = false, initialFocusRef, dismissible = true, bodyClassName = "",
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement;
    openCount += 1;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the requested element, else the first field, else the panel.
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ||
      panel?.querySelector("input, textarea, select") ||
      panel;
    target?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
    // Mount-only: re-running would steal focus back on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widths = { sm: "md:max-w-sm", md: "md:max-w-md", lg: "md:max-w-lg", xl: "md:max-w-2xl" };
  const layout = {
    sheet: `items-end md:items-center`,
    center: `items-center p-4`,
    full: `items-stretch md:items-center md:p-6`,
    drawer: `items-stretch !justify-start`,
  }[variant];
  const panel = {
    sheet: `w-full ${widths[size]} max-h-[88dvh] rounded-t-sheet md:rounded-sheet anim-sheet md:anim-pop pb-safe`,
    center: `w-full ${widths[size]} max-h-[88dvh] rounded-sheet anim-pop`,
    full: `w-full h-full md:h-auto md:max-h-[90dvh] ${widths[size]} md:rounded-sheet anim-rise pb-safe`,
    drawer: `h-full w-[86%] max-w-xs rounded-r-sheet anim-drawer pt-safe pb-safe`,
  }[variant];

  return createPortal(
    <div className={`fixed inset-0 z-sheet flex justify-center bg-black/65 backdrop-blur-[2px] anim-fade ${layout}`}
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`flex flex-col overflow-hidden bg-surface shadow-overlay outline-none ${panel}`}>
        {variant === "sheet" && (
          <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
            <span className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
        )}
        <header className={`flex shrink-0 items-center gap-2 pl-5 pr-2 ${hideTitle ? "min-h-12" : "min-h-14"}`}>
          <h2 id={titleId} className={hideTitle ? "sr-only" : "min-w-0 flex-1 truncate text-title-3"}>{title}</h2>
          {hideTitle && <span className="flex-1" />}
          {dismissible && <IconButton icon={X} label="Close" onClick={onClose} />}
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-5 ${bodyClassName}`}>{children}</div>
        {footer && <footer className="shrink-0 border-t border-line px-5 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/* Confirmation for anything destructive. The destructive button names the
   thing it destroys: "Delete post", not "OK". */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, busy, tone = "danger", children }) {
  return (
    <Dialog title={title} onClose={onClose} variant="center" size="sm">
      {body && <p className="text-callout text-fg-muted">{body}</p>}
      {children}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose}
          className="press min-h-11 rounded-control border border-line-strong bg-surface-2 px-4 text-callout font-semibold hover:bg-surface-3">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy || undefined}
          className={`press min-h-11 rounded-control px-4 text-callout font-semibold text-white disabled:opacity-50 ${
            tone === "danger" ? "bg-danger hover:bg-red-700" : "bg-accent hover:bg-accent-hover"
          }`}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
