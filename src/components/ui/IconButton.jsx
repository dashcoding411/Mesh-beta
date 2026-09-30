import { forwardRef } from "react";
import { compact } from "../../lib/format";

// `label` is required. Hit area is at least 44px (WCAG 2.5.5); `count` is
// included in the accessible name.
const TONES = {
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  solid: "bg-surface-2 text-fg hover:bg-surface-3 border border-line",
  overlay: "text-white bg-black/35 hover:bg-black/55 backdrop-blur-sm",
  bare: "text-fg-muted hover:text-fg",
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-surface-2 disabled:text-fg-subtle disabled:opacity-100",
};
// Pressed colour must win over the hover colour.
const PRESSED = {
  ghost: "hover:bg-surface-2",
  solid: "bg-surface-2 hover:bg-surface-3 border border-line",
  overlay: "bg-black/35 hover:bg-black/55 backdrop-blur-sm",
  bare: "",
  primary: "bg-accent text-white hover:bg-accent-hover",
};

const IconButton = forwardRef(function IconButton(
  {
    icon: Icon, label, count, countNoun, pressed, activeClass = "text-accent-text",
    tone = "ghost", size = 20, filled = false, vertical = false, className = "", type = "button", ...rest
  },
  ref
) {
  const hasCount = typeof count === "number";
  const name = hasCount && count > 0 && countNoun
    ? `${label}, ${count} ${countNoun}${count === 1 ? "" : "s"}`
    : label;

  return (
    <button
      ref={ref}
      type={type}
      aria-label={name}
      title={label}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
      className={`press inline-flex shrink-0 items-center justify-center rounded-full
        min-h-11 ${hasCount && !vertical ? "gap-1.5 px-2.5" : vertical ? "flex-col gap-1 px-1" : "min-w-11"}
        disabled:opacity-40 ${pressed ? `${PRESSED[tone]} ${activeClass}` : TONES[tone]} ${className}`}
      {...rest}
    >
      <Icon size={size} strokeWidth={2} aria-hidden="true"
        fill={filled || pressed ? "currentColor" : "none"} />
      {hasCount && count > 0 && (
        <span aria-hidden="true" className={`tabular font-semibold ${vertical ? "text-label" : "text-caption"}`}>
          {compact(count)}
        </span>
      )}
    </button>
  );
});

export default IconButton;
