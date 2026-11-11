// Someone who has never used Mesh on this device gets the welcome page before
// anything else. It arrives in the HTML (scripts/prerender.mjs), and the app
// draws it without waiting to learn who's signed in, because it's the same
// for anyone who isn't. src/boot.js makes the same call before the first
// paint: keep the two in step.

// Storage that can't be read counts as "been here": the app then waits for
// the sign-in check, as it always used to.
const has = (key) => { try { return !!localStorage.getItem(key); } catch { return true; } };

/** Whether an account was signed in here at the last visit (lib/auth.js keeps the note). */
export const hadAccountHere = () => has("mesh:last-account");

let mod = null;
/** Starts (or joins) the download of the welcome page's code. */
export const loadWelcome = () => import("../components/Welcome").then((m) => (mod = m));
/** The welcome page if its code has arrived, so it can be drawn without a loading step. */
export const welcomeNow = () => mod?.default || null;

/** True when this page load opens on the welcome page, whoever turns out to be signed in. */
export function opensOnWelcome() {
  if (typeof window === "undefined" || hadAccountHere()) return false;
  // Coming back from Google's sign-in page (googleReturning in lib/auth.js).
  if (/(^#|&)(id_token|error)=/.test(window.location.hash)) return false;
  const path = window.location.pathname;
  return path === "/welcome" || (path === "/" && !has("mesh:welcomed"));
}
