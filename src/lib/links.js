// User-content links: same-origin links route in-app; others go through ExternalLinkDialog.
import { navigate } from "./router";

export const EXTERNAL_LINK_EVENT = "mesh:external-link";

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
