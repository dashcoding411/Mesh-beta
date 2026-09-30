const TONES = {
  neutral: "bg-surface-3 text-fg-muted",
  accent: "bg-accent-soft text-accent-ring",
  success: "bg-emerald-500/15 text-success-text",
  warning: "bg-amber-500/15 text-warning-text",
  danger: "bg-red-500/15 text-danger-text",
};

export default function Badge({ tone = "neutral", icon: Icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold ${TONES[tone]} ${className}`}>
      {Icon && <Icon size={12} strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </span>
  );
}
