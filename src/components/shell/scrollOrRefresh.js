import { motionReduced } from "../../lib/appearance";

// Scroll to top, or dispatch "mesh:refresh" if already there.
export function scrollOrRefresh() {
  const el = document.getElementById("mesh-main")?.querySelector("[data-scroll]");
  if (el && el.scrollTop > 8) el.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" });
  else window.dispatchEvent(new Event("mesh:refresh"));
}
