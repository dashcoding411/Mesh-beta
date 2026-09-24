import { forwardRef } from "react";
import { Spinner } from "./States";

/* One button, five jobs. Hierarchy is the point: a screen should have one
   primary action at most, so "primary" is a decision, not a default.

     primary:   the one thing this screen is for
     secondary: a real alternative (Cancel, Message)
     ghost:     low-emphasis actions that sit in a row of others
     danger:    destroys something; always paired with a confirmation
     brand:     the gradient. Reserved for Create and first-run CTAs.

   Hover goes darker, never lighter: white text on violet-500 is only 4.2:1,
   which fails AA. violet-700 on hover is 7.1:1. */
const VARIANTS = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-raised",
  secondary: "bg-surface-2 text-fg border border-line-strong hover:bg-surface-3",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:bg-red-700",
  "danger-ghost": "text-danger-text hover:bg-red-500/10",
  brand: "bg-gradient-to-r from-brand-from to-brand-to text-white shadow-glow hover:brightness-90",
};

const SIZES = {
  sm: "min-h-9 px-3 text-callout gap-1.5 rounded-[10px]",
  md: "min-h-11 px-4 text-callout gap-2 rounded-control",
  lg: "min-h-12 px-5 text-body gap-2 rounded-control",
};

const Button = forwardRef(function Button(
  {
    variant = "secondary", size = "md", loading = false, disabled = false,
    icon: Icon, iconRight: IconRight, full = false, className = "", children, type = "button", ...rest
  },
  ref
) {
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press relative inline-flex select-none items-center justify-center font-semibold
        disabled:cursor-not-allowed disabled:opacity-50
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {/* The label stays in the layout while loading so the button never
          changes width under the pointer, only its content swaps. */}
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
    </button>
  );
});

export default Button;
