// Links people post or send. Mesh's own open in the app; anything else goes
// through the "you're leaving Mesh" step (ui/ExternalLink.jsx).
import { navigate } from "./router";

export const EXTERNAL_LINK_EVENT = "mesh:external-link";

/* Follow a link someone posted or sent. Mesh's own links open in the app;
   anything else asks first, because it's a website Mesh doesn't run. */
export function followLink(url, e) {
  e?.preventDefault();
  e?.stopPropagation();
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (!/^https?:$/.test(parsed.protocol)) return;
  if (parsed.origin === window.location.origin) {
    navigate(parsed.pathname + parsed.search);
    return;
  }
  window.dispatchEvent(new CustomEvent(EXTERNAL_LINK_EVENT, { detail: parsed.href }));
}
