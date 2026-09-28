import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { INTERESTS, MAX_INTERESTS, interestById } from "../lib/interests";
import { saveMyInterests } from "../lib/db";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { useToast } from "./ui/toast-context";

/* A wrap of toggle chips. Used to pick your interests, a post's topics
   (max 3) and a circle's interests (max 3). Each chip is a real toggle
   button, announced as pressed or not. */
export function InterestToggles({ value, onChange, max = MAX_INTERESTS, options = INTERESTS, label = "Interests" }) {
  const full = value.length >= max;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((i) => {
        const on = value.includes(i.id);
        const Icon = i.icon;
        return (
          <button key={i.id} type="button" aria-pressed={on} disabled={!on && full}
            onClick={() => onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])}
            className={`press inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-callout font-medium transition-colors disabled:opacity-40 ${
              on ? "border-accent-text bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
            }`}>
            {on ? <Check size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

/* The chips across the top of For you and Flicks: All, then your interests.
   A radio group, because exactly one is selected. */
export function InterestChips({ interests, value, onChange, onEdit, overlay = false }) {
  if (!interests?.length) {
    return onEdit ? (
      <div className={`flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 ${overlay ? "" : "border-b border-line"}`}>
        <button type="button" onClick={onEdit}
          className={`press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${
            overlay ? "bg-white/20 text-white backdrop-blur" : "bg-accent-soft text-accent-ring"
          }`}>
          <Sparkles size={14} aria-hidden="true" /> Pick your interests
        </button>
      </div>
    ) : null;
  }
  const chips = [{ id: "all", label: "All" }, ...interests.map((id) => interestById(id)).filter(Boolean)];
  return (
    <div role="radiogroup" aria-label="Show posts about"
      className={`flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 ${overlay ? "" : "border-b border-line"}`}>
      {chips.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.id)}
            className={`press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold transition-colors ${
              overlay
                ? on ? "bg-white text-black" : "bg-black/35 text-white backdrop-blur hover:bg-black/50"
                : on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
            }`}>
            {c.label}
          </button>
        );
      })}
      {onEdit && (
        <button type="button" onClick={onEdit}
          className={`press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold ${
            overlay ? "text-white/80 hover:text-white" : "text-accent-text hover:underline"
          }`}>
          Edit
        </button>
      )}
    </div>
  );
}

/* Picking interests: first run, and from Settings. Private: stored where
   only you can read it, used only to shape what you see. */
export function InterestsDialog({ initial = [], onClose, onSaved, firstRun = false }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveMyInterests(value);
      onSaved(value);
      toast({ title: value.length ? "Interests saved" : "Interests cleared" });
    } catch {
      toast({ tone: "error", title: "Couldn't save your interests" });
      setBusy(false);
    }
  };
  return (
    <Dialog title={firstRun ? "What are you into?" : "Your interests"} onClose={onClose} variant="full" size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-fg-subtle tabular">{value.length} of {MAX_INTERESTS}</p>
          <div className="flex gap-2">
            <Button onClick={onClose}>{firstRun ? "Skip" : "Cancel"}</Button>
            <Button variant="primary" loading={busy} onClick={save}>{firstRun ? "Show me" : "Save"}</Button>
          </div>
        </div>
      }>
      <p className="mb-5 text-callout text-fg-muted">
        Pick a few. They become filters at the top of For you and Flicks, and help rank what you see.
        Only you can see them.
      </p>
      <InterestToggles value={value} onChange={setValue} />
    </Dialog>
  );
}
