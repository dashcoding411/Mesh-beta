export function TopicChips({ topics, value, onChange, label, withAll = false }) {
  const options = withAll ? ["", ...topics] : topics;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((t) => {
        const on = value === t;
        return (
          <button key={t || "all"} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(on && !withAll ? "" : t)}
            className={`press min-h-9 rounded-full px-3 text-callout font-medium ring-1 transition-colors ${
              on ? "bg-fg text-canvas ring-fg" : "bg-surface-2 text-fg-muted ring-line hover:text-fg"
            }`}>
            {t || "All"}
          </button>
        );
      })}
    </div>
  );
}
