// Authentication helpers: providers, persistence, recovery, error mapping.
import { auth } from "../firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
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
// full-page redirect.
function withPopup(provider, remember) {
  markPersistence(remember);
  return signInWithPopup(auth, provider).catch((err) => {
    if (err?.code === "auth/popup-blocked") return signInWithRedirect(auth, provider);
    throw err;
  });
}

export function signInGoogle(remember) {
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
  "auth/weak-password": "Password must be at least 8 characters.",
  "auth/invalid-credential": "The email or password you entered is incorrect.",
  "auth/wrong-password": "The email or password you entered is incorrect.",
  "auth/user-not-found": "The email or password you entered is incorrect.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Can't reach the network. Check your connection.",
  "auth/requires-recent-login": "For security, log in again before changing this.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and retry.",
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
