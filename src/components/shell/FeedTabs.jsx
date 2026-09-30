import { Sparkles } from "lucide-react";
import { FEED_TABS } from "../../lib/surfaces";
import { interestById } from "../../lib/interests";
import { navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";

const CHIP = "press inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold transition-colors";

// One row of chips: the two feeds, then the viewer's interests, which
// narrow For you. `topic` is "all" or an interest id.
export default function FeedTabs({ mode, topic, interests = [], onTopic, onEdit, guest = false }) {
  const topics = interests.map((id) => interestById(id)).filter(Boolean);
  const feeds = guest ? [] : FEED_TABS;
  if (!feeds.length && !topics.length) return null;
  const current = mode === "following" ? "following" : topic === "all" ? "foryou" : topic;

  const pick = (id) => {
    if (id === current) return scrollOrRefresh();
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
    <div role="radiogroup" aria-label="Feed" className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 py-2">
      {feeds.map((t) => chip(t.id, t.label))}
      {feeds.length > 0 && (topics.length > 0 || onEdit) && <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-line-strong" />}
      {topics.map((t) => chip(t.id, t.label))}
      {onEdit && (topics.length ? (
        <button type="button" onClick={onEdit} className={`${CHIP} text-accent-text hover:underline`}>Edit</button>
      ) : (
        <button type="button" onClick={onEdit} className={`${CHIP} gap-1.5 bg-accent-soft text-accent-ring`}>
          <Sparkles size={14} aria-hidden="true" /> Pick your interests
        </button>
      ))}
    </div>
  );
}
