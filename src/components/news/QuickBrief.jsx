import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Radio, Timer } from "lucide-react";
import { markStoryRead } from "../../lib/newsBrief";
import { navigate } from "../../lib/router";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { AuthorLine } from "./Journalist";
import { TopicLabel } from "./parts";
import { quickPoints } from "./text";

/** Today's brief as 60-second versions, one at a time, then done. */
export default function QuickBrief({ stories, onClose, onRead }) {
  const [at, setAt] = useState(0);
  const story = stories[at];
  const done = !story;
  const last = stories.length;
  const touch = useRef(null);

  useEffect(() => {
    if (!story) return;
    markStoryRead(story.id);
    onRead?.(story.id);
  }, [story, onRead]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setAt((n) => Math.min(n + 1, last));
      if (e.key === "ArrowLeft") setAt((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [last]);

  const go = (d) => setAt((n) => Math.min(Math.max(n + d, 0), last));
  const swipe = {
    onTouchStart: (e) => { touch.current = e.touches[0].clientX; },
    onTouchEnd: (e) => {
      const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      touch.current = null;
    },
  };

  return (
    <Dialog title="Quick read" onClose={onClose} variant="full" size="md"
      footer={done ? (
        <Button variant="primary" full onClick={onClose}>Close</Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button icon={ArrowLeft} onClick={() => go(-1)} disabled={at === 0}>Back</Button>
          <Button variant="ghost" className="flex-1" onClick={() => navigate(`/news/${story.id}`)}>Full story</Button>
          <Button variant="primary" onClick={() => go(1)}>{at === last - 1 ? "Done" : "Next"}<ArrowRight size={16} aria-hidden="true" /></Button>
        </div>
      )}>
      <div className="flex min-h-full flex-col" {...swipe}>
        <ol className="flex gap-1" aria-label={done ? "Finished" : `Story ${at + 1} of ${last}`}>
          {stories.map((s, i) => (
            <li key={s.id} className={`h-1 flex-1 rounded-full ${i <= at ? "bg-accent-text" : "bg-surface-3"}`} />
          ))}
        </ol>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white"><Check size={28} aria-hidden="true" /></span>
            <p className="mt-4 font-display text-title-2">That's the news.</p>
            <p className="mt-1 text-callout text-fg-muted">You're done for today. Go and do something else.</p>
          </div>
        ) : (
          <article key={story.id} aria-live="polite" className="anim-fade pt-5">
            <p className="flex flex-wrap items-center gap-2 text-label">
              <TopicLabel id={story.topic} />
              {story.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
            </p>
            <h3 className="mt-2 font-display text-title-1 leading-tight">{story.title}</h3>
            <div className="mt-3"><AuthorLine item={story} /></div>
            <p className="mt-5 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
              <Timer size={14} aria-hidden="true" /> The 60-second version
            </p>
            <ul className="mt-2 space-y-3">
              {quickPoints(story).map((k, i) => (
                <li key={i} className="flex gap-3 text-body leading-relaxed text-fg">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" aria-hidden="true" />{k}
                </li>
              ))}
            </ul>
          </article>
        )}
      </div>
    </Dialog>
  );
}
