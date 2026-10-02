import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])", "select:not([disabled])",
  "textarea:not([disabled])", "video[controls]", "audio[controls]", "[tabindex]:not([tabindex='-1'])",
].join(",");

// Is another modal layer in front of `root` (opened later, not inside it)?
function covered(root) {
  return [...document.querySelectorAll("[aria-modal='true']")].some((el) =>
    el !== root && !root.contains(el) && !el.contains(root)
    && (root.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
}

/**
 * For full-screen layers that aren't ui/Dialog: Tab and Shift+Tab stay inside
 * the layer while it's open and in front, and focus goes back to whatever
 * opened it afterwards. Pass `ref` to use an existing ref; `active: false`
 * pauses it (e.g. a call minimised to a floating window).
 */
export function useFocusTrap({ ref: given, active = true, restore = true } = {}) {
  const own = useRef(null);
  const ref = given || own;

  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      const root = ref.current;
      if (e.key !== "Tab" || !root || covered(root)) return;
      const active = document.activeElement;
      // A layer inside this one (a menu, a dialog) looks after itself.
      const layer = active?.closest?.("[aria-modal='true']");
      if (layer && layer !== root && root.contains(layer)) return;
      const nodes = [...root.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
      if (!nodes.length) { e.preventDefault(); root.focus?.(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!root.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restore && opener?.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, active, restore]);

  return ref;
}
