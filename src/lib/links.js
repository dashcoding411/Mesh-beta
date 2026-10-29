// User-content links: Mesh's own links route in-app (in the iPhone app too,
// where they're joinmesh.social links); others go through ExternalLinkDialog.
import { navigate } from "./router";
import { siteOrigin } from "./native";

export const EXTERNAL_LINK_EVENT = "mesh:external-link";

export function followLink(url, e) {
  e?.preventDefault();
  e?.stopPropagation();
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (!/^https?:$/.test(parsed.protocol)) return;
  if (parsed.origin === window.location.origin || parsed.origin === siteOrigin()) {
    navigate(parsed.pathname + parsed.search);
    return;
  }
  window.dispatchEvent(new CustomEvent(EXTERNAL_LINK_EVENT, { detail: parsed.href }));
}
