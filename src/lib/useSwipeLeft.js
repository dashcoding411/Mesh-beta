import { useEffect } from "react";
import { motionReduced } from "./appearance";
import { shutterBuzz } from "./shutter";

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
const ENOUGH = 0.3; // of the screen's width, dragged left, opens it on letting go
const FLICK = 0.45; // or a quick flick: px per ms, over at least 40 px
const SETTLE_MS = 240;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Swiping left (finger moving right to left) across `ref`'s element on a
 * touch screen opens something as a page coming in from the right, like
 * Home to the camera. `panelRef` is that page's stand-in: it follows the
 * finger in from the right edge while the page behind shifts a little. Past
 * the point where letting go opens it, the phone buzzes and
 * `onReady(true)` lets the panel say so. Letting go there glides the panel
 * over the screen and calls `onSwipe`; short of it, it slides back.
 * Vertical scrolling is left alone.
 */
export function useSwipeLeft(ref, onSwipe, { enabled = true, panelRef = null, onReady = null } = {}) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;
    let start = null; // { x, y, t, state: "maybe" | "side" | "no", ready }
    let settle = 0;
    const width = () => window.innerWidth || 1;
    const place = (dx, animate) => {
      const panel = panelRef?.current;
      const still = motionReduced();
      const how = animate ? `transform ${SETTLE_MS}ms ${EASE}` : "none";
      if (panel) {
        const left = Math.max(0, width() + dx);
        panel.style.transition = still ? "none" : how;
        panel.style.transform = `translateX(${left}px)`;
        // What's on it stays in the middle of the part showing, so it reads
        // from the first few centimetres.
        const inner = panel.firstElementChild;
        if (inner) {
          inner.style.transition = panel.style.transition;
          inner.style.transform = `translateX(${-left / 2}px)`;
        }
      }
      if (!still) {
        root.style.transition = how;
        root.style.transform = dx ? `translateX(${dx * 0.2}px)` : "";
      }
    };
    const ready = (on) => {
      if (!start || start.ready === on) return;
      start.ready = on;
      if (on) shutterBuzz();
      onReady?.(on);
    };
    const back = () => {
      place(0, true);
      onReady?.(false);
    };
    const onStart = (e) => {
      if (e.touches.length !== 1 || ownedElsewhere(e.target, root)) { start = null; return; }
      const t = e.touches[0];
      clearTimeout(settle);
      start = { x: t.clientX, y: t.clientY, t: performance.now(), state: "maybe", ready: false };
    };
    const onMove = (e) => {
      if (!start || start.state === "no") return;
      const t = e.touches[0];
      const dx = Math.min(0, t.clientX - start.x);
      const dy = t.clientY - start.y;
      if (start.state === "maybe") {
        if (Math.abs(dy) > DECIDE && Math.abs(dy) >= Math.abs(t.clientX - start.x)) { start.state = "no"; return; }
        if (dx < -DECIDE && Math.abs(dx) > Math.abs(dy) * 1.4) start.state = "side";
        else return;
      }
      place(dx, false);
      ready(-dx > width() * ENOUGH);
    };
    const onEnd = (e) => {
      if (start?.state !== "side") { start = null; return; }
      const t = e.changedTouches[0];
      const dx = Math.min(0, t.clientX - start.x);
      const speed = -dx / Math.max(1, performance.now() - start.t);
      start = null;
      if (-dx > width() * ENOUGH || (-dx > 40 && speed > FLICK)) {
        // The page glides in, then the camera opens over it.
        place(-width(), true);
        settle = setTimeout(() => {
          onSwipe();
          // Out of the way once the camera is up (or if it didn't open).
          settle = setTimeout(() => { place(0, false); root.style.transform = ""; onReady?.(false); }, 900);
        }, motionReduced() ? 0 : SETTLE_MS);
      } else back();
    };
    const onCancel = () => { if (start?.state === "side") back(); start = null; };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      clearTimeout(settle);
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onCancel);
      root.style.transform = "";
      root.style.transition = "";
    };
  }, [ref, onSwipe, enabled, panelRef, onReady]);
}
