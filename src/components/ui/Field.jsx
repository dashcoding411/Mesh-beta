import { cloneElement, forwardRef, useCallback, useEffect, useId, useRef } from "react";
import { InlineMessage } from "./States";

/* Labels are always visible, placeholders are examples, never the label.
   The field wires up aria-describedby and aria-invalid itself so no caller
   can forget to.

   Border is the `field` token, which clears the 3:1 non-text contrast
   minimum: an input should be findable by its edge, not only its hint. */

export const fieldClass =
  "field w-full rounded-control bg-surface-2 border border-field px-3.5 py-2.5 text-input text-fg " +
  "placeholder:text-fg-subtle transition-colors duration-standard " +
  "hover:border-fg-subtle focus:border-accent-text focus:ring-4 focus:ring-accent/25 " +
  "disabled:opacity-60 disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-danger-text aria-[invalid=true]:focus:ring-red-500/20";

export function Field({ label, hint, error, count, max, optional, children, className = "" }) {
  const autoId = useId();
  const id = children.props.id || autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-callout font-medium text-fg">
          {label}
          {optional && <span className="ml-1.5 font-normal text-fg-subtle">Optional</span>}
        </label>
        {typeof count === "number" && max && (
          <span className={`tabular text-label ${count > max * 0.9 ? "text-warning-text" : "text-fg-subtle"}`}
            aria-hidden="true">
            {count}/{max}
          </span>
        )}
      </div>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? "true" : undefined,
      })}
      <div className="mt-1.5 space-y-1">
        {hint && !error && <p id={hintId} className="text-caption text-fg-subtle">{hint}</p>}
        <div aria-live="polite">
          <InlineMessage id={errorId}>{error}</InlineMessage>
        </div>
      </div>
    </div>
  );
}

export const Input = forwardRef(function Input({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`${fieldClass} min-h-11 ${className}`} {...rest} />;
});

/** Grows with its content up to `maxRows`, then scrolls. */
export const Textarea = forwardRef(function Textarea({ className = "", autoGrow = false, maxRows = 8, rows = 3, ...rest }, ref) {
  const inner = useRef(null);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const fit = useCallback(() => {
    const el = inner.current;
    if (!autoGrow || !el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const pad = el.offsetHeight - el.clientHeight + 20;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + pad)}px`;
  }, [autoGrow, maxRows]);
  useEffect(fit);
  // The words rewrap when the box gets wider or narrower (a rotated phone,
  // a resized window, the web font arriving), so measure again then.
  useEffect(() => {
    const el = inner.current;
    if (!autoGrow || !el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; fit(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoGrow, fit]);

  return (
    <textarea ref={setRef} rows={rows}
      className={`${fieldClass} resize-none ${className}`} {...rest} />
  );
});

export const Select = forwardRef(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${fieldClass} min-h-11 pr-9 ${className}`} {...rest}>
      {children}
    </select>
  );
});

/** Checkbox with a real label and a 44px row, not a 16px square to aim at. */
export function Checkbox({ checked, onChange, children, description, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-field bg-surface-2 accent-violet-600" />
      <span className="text-callout text-fg">
        {children}
        {description && <span className="mt-0.5 block text-caption text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
}
