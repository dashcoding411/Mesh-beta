import { useEffect } from "react";

// The browser tab's title, from whatever is on screen. Several components can
// ask at once (the section, then the circle or profile open inside it), so the
// most specific wins: a higher level beats a lower one, and among equals the
// most recent. When a component goes away its title is dropped.
const entries = new Map();
let seq = 0;

function apply() {
  let best = null;
  for (const e of entries.values()) {
    if (!best || e.level > best.level || (e.level === best.level && e.seq > best.seq)) best = e;
  }
  document.title = best?.title ? `${best.title} · Mesh` : "Mesh";
}

/** level 0: a section ("Messages"); 1: something inside it ("Melbourne Makers"); 2: an overlay ("@sam"). */
export function usePageTitle(title, level = 1) {
  useEffect(() => {
    if (title === undefined || title === null) return undefined;
    const id = ++seq;
    entries.set(id, { title, level, seq: id });
    apply();
    return () => {
      entries.delete(id);
      apply();
    };
  }, [title, level]);
}
