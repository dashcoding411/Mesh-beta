import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToastContext } from "./toast-context";
import { createPortal } from "react-dom";
import { Check, AlertTriangle, Info, X } from "lucide-react";

// Polite live region for success, assertive for errors. Durations: 4s,
// 6s with an action, 8s for errors; paused on hover/focus. Max three.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((input) => {
    const t = typeof input === "string" ? { title: input } : input;
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, tone: "success", ...t }]);
    return id;
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-toast flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-[76px] md:items-end md:px-6 xl:right-64">
          {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.tone === "error" ? 8000 : toast.action ? 6000 : 4000;

  useEffect(() => {
    if (!duration || paused) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, paused, onDismiss]);

  const Icon = { success: Check, error: AlertTriangle, info: Info }[toast.tone] || Info;
  const iconTone = { success: "text-success-text", error: "text-danger-text", info: "text-accent-text" }[toast.tone];

  return (
    <div role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border border-line-strong bg-surface-2 py-2 pl-4 pr-2 shadow-overlay anim-toast">
      <Icon size={18} className={`shrink-0 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-callout font-medium text-fg">{toast.title}</p>
        {toast.body && <p className="text-caption text-fg-muted">{toast.body}</p>}
      </div>
      {toast.action && (
        <button type="button" onClick={() => { toast.action.onClick(); onDismiss(); }}
          className="press min-h-11 shrink-0 rounded-control px-3 text-callout font-semibold text-accent-text hover:bg-surface-3">
          {toast.action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification"
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
