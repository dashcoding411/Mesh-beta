// Authentication helpers: providers, persistence, recovery, error mapping.
import { auth } from "../firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from "firebase/auth";

// "Remember me" keeps the refresh token in local storage; otherwise the
// session ends when the tab closes.
export async function applyPersistence(remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

export async function signInEmail(email, password, remember) {
  await applyPersistence(remember);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpEmail(email, password, remember) {
  await applyPersistence(remember);
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInGoogle(remember) {
  await applyPersistence(remember);
  const provider = new GoogleAuthProvider();
  // Baseline scopes only: no posting or contacts access at sign-in.
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInApple(remember) {
  await applyPersistence(remember);
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return signInWithPopup(auth, provider);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
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

// User-facing messages. Deliberately specific where it is safe, and vague
// where being specific would confirm whether an account exists.
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

// Closing the provider popup is a normal user action, not an error.
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
