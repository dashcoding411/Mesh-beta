import { forwardRef } from "react";
import { Spinner } from "./States";

// variant: primary (at most one per screen) | secondary | ghost | danger | brand.
// Hover darkens rather than lightens to keep white text at AA contrast.
const VARIANTS = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-raised",
  secondary: "bg-surface-2 text-fg border border-line-strong hover:bg-surface-3",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:bg-red-700",
  "danger-ghost": "text-danger-text hover:bg-red-500/10",
  brand: "bg-accent text-white hover:bg-accent-hover",
};

const SIZES = {
  sm: "min-h-9 px-3 text-callout gap-1.5 rounded-[10px]",
  md: "min-h-11 px-4 text-callout gap-2 rounded-control",
  lg: "min-h-12 px-5 text-body gap-2 rounded-control",
};

const Button = forwardRef(function Button(
  {
    variant = "secondary", size = "md", loading = false, disabled = false,
    icon: Icon, iconRight: IconRight, full = false, className = "", children, type = "button", href, ...rest
  },
  ref
) {
  const iconSize = size === "sm" ? 16 : 18;
  // With an href it's a real link that looks the same: it works before the
  // app has loaded, opens in a new tab, and search engines can follow it.
  const Tag = href ? "a" : "button";
  return (
    <Tag
      ref={ref}
      {...(href ? { href } : { type, disabled: disabled || loading })}
      aria-busy={loading || undefined}
      className={`press relative inline-flex select-none items-center justify-center font-semibold
        disabled:cursor-not-allowed disabled:opacity-50
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {/* Label keeps its width while loading. */}
      <span className={`inline-flex items-center gap-[inherit] ${loading ? "invisible" : ""}`}>
        {Icon && <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />}
        {children}
        {IconRight && <IconRight size={iconSize} strokeWidth={2} aria-hidden="true" />}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={iconSize} />
        </span>
      )}
    </Tag>
  );
});

export default Button;
