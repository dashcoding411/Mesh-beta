import { useEffect } from "react";

// Document title arbitration: highest level wins, then most recent.
// With nothing to show (Home, the welcome page) it's the title the HTML
// arrives with (scripts/prerender.mjs).
const HOME_TITLE = "Mesh: social media for humans";
const entries = new Map();
let seq = 0;

function apply() {
  let best = null;
  for (const e of entries.values()) {
    if (!best || e.level > best.level || (e.level === best.level && e.seq > best.seq)) best = e;
  }
  document.title = best?.title ? `${best.title} · Mesh` : HOME_TITLE;
}

/** level: 0 section, 1 detail page, 2 overlay. */
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
