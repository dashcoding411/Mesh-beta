import { useRef } from "react";

/* A choice of one from 2–4 options that applies straight away (theme, text
   size). It's a radio group, not tabs: nothing below it switches panels.
   Arrow keys move and select, and only the chosen option is in the Tab order. */
export default function Segmented({ options, value, onChange, label, labelledBy, className = "" }) {
  const refs = useRef([]);

  const onKey = (e, i) => {
    const last = options.length - 1;
    const next = {
      ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1,
      Home: 0, End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy}
      className={`flex rounded-control bg-surface-2 p-1 ${className}`}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button key={o.id} ref={(el) => (refs.current[i] = el)} role="radio" type="button"
            aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)} onKeyDown={(e) => onKey(e, i)}
            className={`min-h-9 flex-1 rounded-[9px] px-2 text-callout font-semibold transition-colors ${
              on ? "bg-surface-raised text-fg shadow-raised" : "text-fg-subtle hover:text-fg-muted"
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
