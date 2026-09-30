import { useRef } from "react";

// WAI-ARIA tabs with roving tabindex, arrow and Home/End keys.
export default function Tabs({ tabs, value, onChange, label, variant = "segmented", className = "" }) {
  const refs = useRef([]);

  const onKey = (e, i) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  if (variant === "underline") {
    return (
      <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto no-scrollbar border-b border-line ${className}`}>
        {tabs.map((t, i) => {
          const on = t.id === value;
          return (
            <button key={t.id} ref={(el) => (refs.current[i] = el)} role="tab" type="button"
              aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
              className={`relative min-h-11 shrink-0 px-3 text-callout font-semibold transition-colors ${
                on ? "text-fg" : "text-fg-subtle hover:text-fg-muted"
              }`}>
              {t.label}
              {t.count > 0 && <span className="ml-1.5 tabular text-label text-fg-subtle">{t.count}</span>}
              <span aria-hidden="true" className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${
                on ? "bg-fg" : "bg-transparent"
              }`} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="tablist" aria-label={label} className={`inline-flex rounded-control bg-surface-2 p-1 ${className}`}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button key={t.id} ref={(el) => (refs.current[i] = el)} role="tab" type="button"
            aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={`min-h-9 flex-1 rounded-[9px] px-3 text-callout font-semibold transition-colors ${
              on ? "bg-surface-raised text-fg shadow-raised" : "text-fg-subtle hover:text-fg-muted"
            }`}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 tabular text-label opacity-75">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
