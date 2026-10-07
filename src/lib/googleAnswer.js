// Checks Google's answer to Mesh's own sign-in (lib/auth.js, finishGoogleDirect)
// before Firebase sees it: it must answer this tab's request (`state`), carry
// the one-time `nonce` sent with it, and come back within 15 minutes.

const MAX_AGE_MS = 15 * 60_000;

/** The token's claims, decoded but not verified (Firebase verifies the signature). */
export function tokenClaims(idToken) {
  const part = String(idToken).split(".")[1] || "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
}

/**
 * `fragment` is the address's #… part, `saved` what this tab stored before
 * leaving ({ state, nonce, at }). Returns { idToken }, { cancelled: true }
 * when the person backed out, or null when there's no answer; throws when
 * the answer doesn't match.
 */
export function googleAnswer(fragment, saved, now = Date.now()) {
  const hash = new URLSearchParams(String(fragment || "").replace(/^#/, ""));
  if (!hash.has("id_token") && !hash.has("error")) return null;
  if (hash.get("error") === "access_denied") return { cancelled: true };
  if (hash.get("error")) throw Object.assign(new Error(hash.get("error")), { code: "auth/internal-error", reason: `google-${hash.get("error")}` });
  const idToken = hash.get("id_token");
  let claims = null;
  try { claims = tokenClaims(idToken); } catch { /* not a token */ }
  // Which check failed goes in `reason`, shown after the message's code.
  const reason = !saved ? "not-started-here" : !claims ? "bad-token" : hash.get("state") !== saved.state ? "state"
    : claims.nonce !== saved.nonce ? "nonce" : !(now - saved.at < MAX_AGE_MS) ? "expired" : "";
  if (reason) throw Object.assign(new Error("That sign-in didn't match this request."), { code: "auth/internal-error", reason });
  return { idToken };
}
