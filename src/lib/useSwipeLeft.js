import { useEffect } from "react";

// Swipes that start in something that scrolls sideways (a carousel, the
// story row, topic chips), a control, or anything marked data-no-swipe
// belong to that thing, not to the page.
function ownedElsewhere(el, root) {
  for (let n = el; n && n !== root; n = n.parentElement) {
    if (n.dataset?.noSwipe !== undefined) return true;
    if (n.matches?.("input, textarea, select, video, [role='slider']")) return true;
    if (n.scrollWidth > n.clientWidth + 2) {
      const x = getComputedStyle(n).overflowX;
      if (x === "auto" || x === "scroll") return true;
    }
  }
  return false;
}

const DECIDE = 14; // px before the gesture counts as sideways or up-and-down
const ENOUGH = 72; // px to the left that opens it
const FLICK = 0.45; // or a quick flick: px per ms, after at least half that

/**
 * Calls `onSwipe` when someone swipes left (finger moving right to left)
 * across `ref`'s element on a touch screen. `peekRef` (optional) is an
 * element that slides in from the right edge as the finger moves, so the
 * gesture shows where it's going. Vertical scrolling is left alone.
 */
export function useSwipeLeft(ref, onSwipe, { enabled = true, peekRef = null } = {}) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;
    let start = null; // { x, y, t, state: "maybe" | "side" | "no" }
    const peek = (dx) => {
      const el = peekRef?.current;
      if (!el) return;
      const p = Math.max(0, Math.min(1, -dx / ENOUGH));
      el.style.opacity = String(p);
      el.style.transform = `translate(${(1 - p) * 100}%, -50%) scale(${0.85 + 0.15 * p})`;
    };
    const reset = () => {
      start = null;
      const el = peekRef?.current;
      if (el) { el.style.opacity = "0"; el.style.transform = "translate(100%, -50%)"; }
    };
    const onStart = (e) => {
      if (e.touches.length !== 1 || ownedElsewhere(e.target, root)) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: performance.now(), state: "maybe" };
    };
    const onMove = (e) => {
      if (!start || start.state === "no") return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (start.state === "maybe") {
        if (Math.abs(dy) > DECIDE && Math.abs(dy) >= Math.abs(dx)) { start.state = "no"; return; }
        if (dx < -DECIDE && Math.abs(dx) > Math.abs(dy) * 1.4) start.state = "side";
        else return;
      }
      peek(dx);
    };
    const onEnd = (e) => {
      if (start?.state === "side") {
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const speed = -dx / Math.max(1, performance.now() - start.t);
        if (dx < -ENOUGH || (dx < -ENOUGH / 2 && speed > FLICK)) onSwipe();
      }
      reset();
    };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", reset);
    };
  }, [ref, onSwipe, enabled, peekRef]);
}
