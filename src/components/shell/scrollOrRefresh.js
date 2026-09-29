import { motionReduced } from "../../lib/appearance";

/* Tapping the tab you're already on: back to the top if you've scrolled,
   and a refresh if you're already there (the feeds listen for
   "mesh:refresh"). The convention every major app follows. */
export function scrollOrRefresh() {
  const el = document.getElementById("mesh-main")?.querySelector("[data-scroll]");
  if (el && el.scrollTop > 8) el.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" });
  else window.dispatchEvent(new Event("mesh:refresh"));
}
