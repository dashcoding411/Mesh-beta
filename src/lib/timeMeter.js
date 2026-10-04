// Time on Mesh, kept on this device only: seconds per local day while Mesh is
// open, visible and signed in. It feeds "Your week on Mesh" and is never
// uploaded. Brick limits are metered separately (lib/useBrick.js).
import { useEffect } from "react";

const KEY = (uid) => `mesh:time:${uid}`;
const KEEP_DAYS = 21;
const TICK_MS = 15000;

/** Local calendar day, "2026-10-04". */
export function dayStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readTime(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(uid)) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

/** Adds seconds to today and drops days older than three weeks. */
export function addTime(map, seconds, now = Date.now()) {
  const out = { ...map };
  const today = dayStamp(now);
  out[today] = Math.round((out[today] || 0) + seconds);
  const oldest = dayStamp(now - KEEP_DAYS * 86400000);
  for (const k of Object.keys(out)) if (k < oldest) delete out[k];
  return out;
}

/** Seconds recorded on days from `fromMs` up to, not including, `toMs`. */
export function secondsBetween(map, fromMs, toMs) {
  const from = dayStamp(fromMs);
  const to = dayStamp(toMs);
  return Object.entries(map).reduce((sum, [day, s]) => (day >= from && day < to ? sum + (Number(s) || 0) : sum), 0);
}

export function clearTime(uid) {
  try { localStorage.removeItem(KEY(uid)); } catch { /* storage blocked */ }
}

/** Counts visible time while signed in. Gaps (sleep, a hidden tab) aren't counted. */
export function useTimeMeter(uid) {
  useEffect(() => {
    if (!uid) return undefined;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (document.visibilityState !== "visible" || gap > TICK_MS * 2) return;
      try { localStorage.setItem(KEY(uid), JSON.stringify(addTime(readTime(uid), gap / 1000, now))); } catch { /* storage blocked */ }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [uid]);
}
