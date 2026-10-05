// Push notifications. This device subscribes with the browser's push service
// and registers the subscription with Mesh's push Worker (cloudflare/push),
// along with which kinds it wants. When you message, comment, follow or call
// someone, your app asks the Worker to notify them; the Worker checks it
// really happened before sending. Reminders (a roll developing, a gathering
// starting) are set with the Worker and sent on a timer.

import { auth } from "../firebase";
import { isIOS, isStandalone } from "./install";

// The public half of Mesh's VAPID key; the private half is a Worker secret.
export const VAPID_PUBLIC_KEY = "BCyuhLsutwnb_1NVtqVynndGW-0VAbDRpS2hzocrRe-kKHByoawBS6GimBlyiL8oyo64brkAeDfgZJny0JEo0M0";
const API = (import.meta.env.VITE_PUSH_API || (import.meta.env.DEV ? "http://localhost:8787" : "https://mesh-push.meshadmin9.workers.dev")).replace(/\/$/, "");
const KINDS_KEY = "mesh:push-kinds";

export const PUSH_KINDS = [
  { id: "messages", label: "Messages", blurb: "New messages, and message requests without their content" },
  { id: "calls", label: "Calls", blurb: "When someone calls you" },
  { id: "comments", label: "Comments and mentions", blurb: "Comments, replies, mentions and story echoes" },
  { id: "follows", label: "Followers", blurb: "New followers and follow requests" },
  { id: "gatherings", label: "Gatherings", blurb: "Invites, and a reminder 2 hours before ones you're going to" },
  { id: "rolls", label: "Rolls", blurb: "When a roll you're in develops" },
  { id: "account", label: "Account and safety", blurb: "Parental controls, appeals and circles letting you in" },
];
const ALL = PUSH_KINDS.map((k) => k.id);

/** "unsupported" | "install" (iPhone, not on the home screen) | "denied" | "off" | "on". */
export async function pushState() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function savedKinds() {
  try { const v = JSON.parse(localStorage.getItem(KINDS_KEY) || "null"); return Array.isArray(v) ? v.filter((k) => ALL.includes(k)) : ALL; } catch { return ALL; }
}
function saveKinds(kinds) { try { localStorage.setItem(KINDS_KEY, JSON.stringify(kinds)); } catch { /* storage blocked */ } }

async function call(method, path, body) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in first.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    keepalive: true,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The notification service didn't answer.");
  return data;
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

const keyBytes = (b64) => {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
};

/** Asks for permission (from a tap), subscribes, and registers this device. Returns the new state. */
export async function enablePush(kinds = savedKinds()) {
  const state = await pushState();
  if (state === "unsupported" || state === "install" || state === "denied") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  await call("POST", "/devices", { endpoint: json.endpoint, keys: json.keys, kinds });
  saveKinds(kinds);
  return "on";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";
  await call("DELETE", "/devices", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  return "off";
}

async function currentEndpoint() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription())?.endpoint || null;
}

export async function setPushKinds(kinds) {
  saveKinds(kinds);
  const endpoint = await currentEndpoint();
  if (endpoint) await call("PATCH", "/devices", { endpoint, kinds });
}

/**
 * On each visit: re-register this device's subscription (it can change), and
 * tell the Worker when Brick mode makes it quiet (`quietUntil`, ms or 0).
 */
export async function syncPush({ quietUntil = 0 } = {}) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const json = sub.toJSON();
  await call("POST", "/devices", { endpoint: json.endpoint, keys: json.keys, kinds: savedKinds(), quietUntil }).catch(() => {});
}

export async function pushOn() { return (await pushState().catch(() => "off")) === "on"; }

const ASKED_KEY = "mesh:push-asked";
/** Whether to offer notifications now: possible on this device, off, and not offered in the last 2 weeks. Marks it offered. */
export async function shouldOfferPush() {
  if ((await pushState().catch(() => "unsupported")) !== "off") return false;
  try {
    const at = Number(localStorage.getItem(ASKED_KEY) || 0);
    if (Date.now() - at < 14 * 86400000) return false;
    localStorage.setItem(ASKED_KEY, String(Date.now()));
    return true;
  } catch { return false; }
}

// Asking the Worker to notify people. Fire and forget: a failed push never
// gets in the way of the message, comment or call itself.
const quietly = (p) => { p.catch(() => {}); };
export const pushMessage = (chatId, messageId) => quietly(call("POST", "/notify", { kind: "message", chatId, messageId }));
export const pushNotice = (to, id) => quietly(call("POST", "/notify", { kind: "notice", to, id }));
export const pushCall = (callId) => quietly(call("POST", "/notify", { kind: "call", callId }));
export const pushRollDeveloped = (rollId) => quietly(call("POST", "/notify", { kind: "roll", rollId }));

/** Reminders for this account: a roll developing, or a gathering 2 hours out. Only when this device has push on. */
export async function remind(kind, id) {
  if (!(await pushOn())) return false;
  return (await call("POST", "/alerts", { kind, id }).catch(() => ({ ok: false }))).ok;
}
export const forget = (kind, id) => quietly(call("DELETE", "/alerts", { kind, id }));

/** Account deletion: every device and reminder. */
export async function deletePushData() {
  await call("DELETE", "/me").catch(() => {});
  const reg = await navigator.serviceWorker?.getRegistration();
  await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
}
