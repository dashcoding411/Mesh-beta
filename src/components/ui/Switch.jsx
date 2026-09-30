// role="switch"; state is conveyed by thumb position as well as colour.
export default function Switch({ checked, onChange, label, disabled = false, id }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`press relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
        checked ? "border-accent bg-accent" : "border-field bg-surface-3"
      }`}>
      <span aria-hidden="true" className={`inline-block h-6 w-6 rounded-full bg-white shadow-raised transition-transform duration-standard ${
        checked ? "translate-x-[22px]" : "translate-x-[3px]"
      }`} />
    </button>
  );
}
