import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { FEED_TABS } from "../../lib/surfaces";
import { interestById } from "../../lib/interests";
import { navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";

const CHIP = "press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold transition-colors";

// The feed (For you or Following) is a menu, like Instagram's, rather than
// side-by-side tabs; the viewer's interests follow as chips that narrow For
// you. `topic` is "all" or an interest id.
export default function FeedTabs({ mode, topic, interests = [], onTopic, onEdit, guest = false }) {
  const topics = interests.map((id) => interestById(id)).filter(Boolean);
  const feeds = guest ? [] : FEED_TABS;
  if (!feeds.length && !topics.length) return null;
  const current = mode === "following" ? "following" : topic === "all" ? "foryou" : topic;

  const pick = (id) => {
    if (id === current) return id === "foryou" || id === "following" ? scrollOrRefresh() : onTopic("all");
    if (id === "following") return navigate(FEED_TABS.find((t) => t.id === id).path);
    onTopic(id === "foryou" ? "all" : id);
    if (mode !== "foryou") navigate("/");
  };
  const chip = (id, label) => {
    const on = id === current;
    return (
      <button key={id} type="button" role="radio" aria-checked={on} onClick={() => pick(id)}
        className={`${CHIP} ${on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"}`}>
        {label}
      </button>
    );
  };

  return (
    <div data-tour="feed-tabs" className="flex items-center gap-2 px-4 py-2">
      {feeds.length > 0 && <FeedPicker mode={mode} onPick={pick} />}
      <div role="radiogroup" aria-label="Interests" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
      {topics.map((t) => chip(t.id, t.label))}
      {onEdit && (topics.length ? (
        <button type="button" onClick={onEdit} className={`${CHIP} text-accent-text hover:underline`}>Edit</button>
      ) : (
        <button type="button" onClick={onEdit} className={`${CHIP} gap-1.5 bg-accent-soft text-accent-ring`}>
          <Sparkles size={14} aria-hidden="true" /> Pick your interests
        </button>
      ))}
      </div>
    </div>
  );
}

function FeedPicker({ mode, onPick }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const current = FEED_TABS.find((t) => t.id === (mode === "following" ? "following" : "foryou"));

  useEffect(() => {
    if (!open) return undefined;
    wrap.current?.querySelector("[role=menuitemradio]")?.focus();
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { setOpen(false); wrap.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="press inline-flex min-h-9 items-center gap-1 rounded-full bg-fg px-3.5 font-display text-callout font-bold text-canvas">
        {current.label} <ChevronDown size={15} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Feed" className="absolute left-0 top-full z-sheet mt-2 w-60 rounded-card border border-line bg-surface p-1.5 shadow-overlay anim-rise">
          {FEED_TABS.map((t) => (
            <button key={t.id} type="button" role="menuitemradio" aria-checked={t.id === current.id}
              onClick={() => { setOpen(false); onPick(t.id); }}
              className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left hover:bg-surface-2 focus:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-semibold text-fg">{t.label}</span>
                <span className="block text-caption text-fg-subtle">{t.id === "following" ? "Only people you follow, newest first" : "Everyone, newest first"}</span>
              </span>
              {t.id === current.id && <Check size={18} className="shrink-0 text-accent-text" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
