/* Rows inside action sheets and settings lists. Each row is a full-width
   44px+ target with an optional icon and a one-line explanation, so a
   destructive row reads as "Unsend, removes it for everyone", not "Unsend". */
export function MenuItem({ icon: Icon, children, description, onClick, danger = false, disabled = false, trailing }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`press flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
        danger ? "text-danger-text hover:bg-red-500/10" : "text-fg hover:bg-surface-2"
      }`}>
      {Icon && <Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block text-callout font-medium">{children}</span>
        {description && <span className="mt-0.5 block text-caption text-fg-subtle">{description}</span>}
      </span>
      {trailing}
    </button>
  );
}

export function MenuGroup({ title, children }) {
  return (
    <div className="space-y-0.5">
      {title && <p className="px-3 pb-1 pt-3 text-label font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>}
      {children}
    </div>
  );
}
