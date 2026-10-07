// Authentication helpers: providers, persistence, recovery, error mapping.
import { auth, sameSiteAuth } from "../firebase";
import { isIOS, isStandalone } from "./install";
import { googleAnswer } from "./googleAnswer";
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserPopupRedirectResolver,
  signInWithCredential,
  getRedirectResult,
  signInWithPopup as popup,
  signInWithRedirect as redirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  setPersistence,
  browserLocalPersistence,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from "firebase/auth";

// Sessions always use local persistence so every tab shares them. Without
// "keep me signed in", the session ends when the last Mesh tab closes:
// Firebase's own session persistence is per tab, which signs new tabs out.
const EPHEMERAL_KEY = "mesh:ephemeral-session";
const TAB_KEY = "mesh:tab";
let channel = null;

function markTab() {
  try { sessionStorage.setItem(TAB_KEY, "1"); } catch { /* storage blocked */ }
}

function openChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel("mesh-session");
  channel.addEventListener("message", (e) => { if (e.data === "ping") channel.postMessage("pong"); });
  return channel;
}

function anotherTabOpen(timeoutMs = 300) {
  const ch = openChannel();
  if (!ch) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onMessage = (e) => { if (e.data === "pong") { ch.removeEventListener("message", onMessage); resolve(true); } };
    ch.addEventListener("message", onMessage);
    ch.postMessage("ping");
    setTimeout(() => { ch.removeEventListener("message", onMessage); resolve(false); }, timeoutMs);
  });
}

/** Signs out a non-persistent session left over from a closed browser. Run before reading auth state. */
export async function restoreSession() {
  openChannel();
  let ephemeral = false;
  let knownTab = false;
  try {
    ephemeral = localStorage.getItem(EPHEMERAL_KEY) === "1";
    knownTab = sessionStorage.getItem(TAB_KEY) === "1";
  } catch { /* storage blocked */ }
  if (ephemeral && !knownTab && !(await anotherTabOpen())) {
    await auth.authStateReady();
    if (auth.currentUser) await signOut(auth);
  }
  markTab();
}

function markPersistence(remember) {
  try {
    if (remember) localStorage.removeItem(EPHEMERAL_KEY);
    else localStorage.setItem(EPHEMERAL_KEY, "1");
  } catch { /* storage blocked */ }
  markTab();
}

export async function applyPersistence(remember) {
  await setPersistence(auth, browserLocalPersistence);
  markPersistence(remember);
}

/** True when the browser refuses site storage (e.g. cookies blocked), so sign-in can't persist. */
export function storageBlocked() {
  try {
    localStorage.setItem("mesh:probe", "1");
    localStorage.removeItem("mesh:probe");
    return false;
  } catch {
    return true;
  }
}

export async function signInEmail(email, password, remember) {
  await applyPersistence(remember);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpEmail(email, password, remember) {
  await applyPersistence(remember);
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

// Provider sign-in opens its popup in the same tick as the tap: phones
// (iPhones especially) block popups opened after an await. Persistence is
// already local by default. If the popup is blocked anyway, fall back to a
// full-page redirect, which finishes in finishRedirect when the page loads
// again. An iPhone home-screen app can't get a popup's result back, so it
// redirects from the start, once sign-in runs on this site.
// The popup and redirect machinery goes with each call, not on auth itself
// (see firebase.js). Firebase keeps one instance per class it's given, so a
// subclass of our own lets us hold that instance and start it on the sign-in
// page (finishRedirect). Then a tap opens Google's popup at once: Safari
// blocks popups that open more than a moment after the tap.
let resolver = null;
class Resolver extends browserPopupRedirectResolver {
  constructor() { super(); resolver = this; }
}
const signInWithPopup = (a, p) => popup(a, p, Resolver);
const signInWithRedirect = (a, p) => redirect(a, p, Resolver);

function withPopup(provider, remember) {
  markPersistence(remember);
  if (sameSiteAuth && isIOS() && isStandalone()) return signInWithRedirect(auth, provider);
  return signInWithPopup(auth, provider).catch((err) => {
    if (err?.code !== "auth/popup-blocked") throw err;
    // Google has a sturdier way back than Firebase's redirect (see above).
    return provider.providerId === "google.com" && sameSiteAuth ? signInGoogleDirect(remember) : signInWithRedirect(auth, provider);
  });
}

/** True while coming back from a provider's sign-in page (Firebase marks it in this tab). */
export function redirectPending() {
  try { return Object.keys(sessionStorage).some((k) => k.startsWith("firebase:pendingRedirect")); } catch { return false; }
}

/**
 * Finishes a redirect sign-in (the credential, or null), and readies the
 * popup machinery so the next tap opens it straight away.
 */
export function finishRedirect() {
  // M.A.T.H has no popups and no Firebase redirects (see firebase.js).
  if (isIOS() && isStandalone()) return Promise.resolve(null);
  const result = getRedirectResult(auth, Resolver);
  // Firebase makes the resolver once auth has started, so this waits for
  // that. `_initialize` is Firebase's own (tested in auth.test.js); if it
  // ever goes, the first popup just takes a moment longer to open.
  const warm = () => { try { resolver?._initialize?.(auth)?.catch?.(() => {}); } catch { /* still works, just slower */ } };
  result.then(warm, warm);
  return result;
}

// Google sign-in straight from Google, for M.A.T.H (Mesh added to an iPhone's
// home screen) and when a popup is blocked. Firebase's own redirect needs a
// hidden frame that loads Google's script and must answer within 5 seconds,
// which a home-screen app on a phone network often misses ("network
// issue"). Here Mesh goes to Google itself and gets back a signed ID token
// (in the address's fragment, never sent to a server), which Firebase checks
// in one request. Google returns to /__/auth/handler with no query string;
// the edge Worker (cloudflare/edge) forwards that to /login, keeping the
// fragment. `state` and `nonce` tie the answer to this tab's own request.
const GOOGLE_CLIENT_ID = "173524995677-f6rl504oqchruqqs74jvle73qe6kf2kh.apps.googleusercontent.com";
const DIRECT_KEY = "mesh:google-signin";

const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

function signInGoogleDirect(remember) {
  markPersistence(remember);
  const state = randomId();
  const nonce = randomId();
  try { sessionStorage.setItem(DIRECT_KEY, JSON.stringify({ state, nonce, at: Date.now(), back: window.location.pathname + window.location.search })); }
  catch { return Promise.reject(Object.assign(new Error("storage"), { code: "auth/web-storage-unsupported" })); }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${window.location.origin}/__/auth/handler`,
    response_type: "id_token",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return Promise.resolve(null); // leaving for Google
}

let directError = null;
/** A sign-in error from coming back from Google, for the sign-in page to show (once). */
export function takeSignInError() {
  const err = directError;
  directError = null;
  return err;
}

/**
 * Coming back from Google with a token: checks it answers this tab's request,
 * clears it from the address bar and signs in. Runs before Mesh reads who's
 * signed in, so it opens signed in. Resolves to the credential, or null.
 */
export async function finishGoogleDirect() {
  const fragment = window.location.hash;
  if (!/(^#|&)(id_token|error)=/.test(fragment)) return null;
  // The token leaves the address bar (and history) straight away.
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(DIRECT_KEY) || "null");
    sessionStorage.removeItem(DIRECT_KEY);
  } catch { /* storage blocked */ }
  try {
    const answer = googleAnswer(fragment, saved);
    if (!answer || answer.cancelled) return null;
    return await signInWithCredential(auth, GoogleAuthProvider.credential(answer.idToken));
  } catch (err) {
    directError = err;
    return null;
  }
}

export function signInGoogle(remember) {
  // Google only returns to joinmesh.social (its redirect URI), so this is the live site's.
  if (sameSiteAuth && isIOS() && isStandalone()) return signInGoogleDirect(remember);
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  return withPopup(provider, remember);
}

export function signInApple(remember) {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return withPopup(provider, remember);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

/** Sends a verification email that links back to the app. */
export function verifyEmail() {
  return sendEmailVerification(auth.currentUser, { url: `${window.location.origin}/account/settings` });
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export async function reauthenticateAndDelete(currentPassword) {
  const user = auth.currentUser;
  if (user.email && currentPassword) {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
  }
  await deleteUser(user);
}

// Error copy stays vague where specifics would reveal whether an account exists.
const MESSAGES = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with that email already exists. Try logging in instead.",
  "auth/weak-password": "Passwords need at least 8 characters, with an uppercase letter, a number and a symbol.",
  "auth/password-does-not-meet-requirements":
    "Passwords need at least 8 characters, with an uppercase letter, a number and a symbol. Signing in with an older password? Use \"Forgot password\" to set a new one.",
  "auth/invalid-credential": "The email or password you entered is incorrect.",
  "auth/wrong-password": "The email or password you entered is incorrect.",
  "auth/user-not-found": "The email or password you entered is incorrect.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Can't reach the network. Check your connection.",
  "auth/requires-recent-login": "For security, log in again before changing this.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and retry.",
  "auth/web-storage-unsupported":
    "Your browser is blocking what sign-in needs. In Safari, leave Private Browsing, and check Block All Cookies is off (Settings, then Safari).",
  "auth/unauthorized-domain": "Sign-in isn't set up for this web address. Open joinmesh.social and try again.",
  "auth/internal-error": "Sign-in didn't finish. Try again, or use your email address instead.",
  "auth/account-exists-with-different-credential":
    "You already have an account with that email using a different sign-in method.",
  "auth/operation-not-allowed": "That sign-in method isn't enabled for this app yet.",
  "auth/invalid-phone-number": "That phone number isn't valid. Include your country code.",
  "auth/invalid-verification-code": "That code isn't right. Check the SMS and try again.",
  "auth/code-expired": "That code expired. Request a new one.",
};

export const CANCELLED_CODES = [
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
];

export function isCancellation(err) {
  return CANCELLED_CODES.includes(err?.code);
}

export function authMessage(err) {
  if (!err) return "";
  if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err.code) return "Something went wrong signing you in. Please try again.";
  return err.message || "Something went wrong. Please try again.";
}
