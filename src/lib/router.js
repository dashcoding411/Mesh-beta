// A small History-API router. Real URLs mean the phone's Back gesture closes
// the thing you opened instead of leaving the app, a refresh lands you where
// you were, and a policy page has an address you can link to.
//
// Overlays (someone's profile, a single post, the full-length player) are
// "modal routes": they get their own URL but remember the page underneath,
// so the page stays mounted behind them and Back returns to it intact.

import { useSyncExternalStore } from "react";

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") window.addEventListener("popstate", emit);

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const depth = () => window.history.state?.depth || 0;

/**
 * navigate("/messages")                       push a page
 * navigate("/u/abc", { overlay: true })       push an overlay over the current page
 * navigate("/search?q=x", { replace: true })  update without a new history entry
 */
export function navigate(to, { replace = false, overlay = false } = {}) {
  const here = window.location.pathname + window.location.search;
  if (to === here && !overlay) return;
  // An overlay opened from another overlay keeps the original page beneath.
  const bg = overlay ? window.history.state?.bg || here : null;
  const state = { depth: replace ? depth() : depth() + 1, ...(bg ? { bg } : {}) };
  if (replace) window.history.replaceState(state, "", to);
  else window.history.pushState(state, "", to);
  emit();
}

/** Back within the app; if there's nothing to go back to, go to `fallback`. */
export function goBack(fallback = "/") {
  if (depth() > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

let cache = { key: "", value: null };

function read() {
  const { pathname, search } = window.location;
  const bg = window.history.state?.bg || null;
  const key = pathname + search + "|" + (bg || "");
  if (cache.key !== key) {
    cache = { key, value: { path: pathname, query: new URLSearchParams(search), bg } };
  }
  return cache.value;
}

export function useLocation() {
  return useSyncExternalStore(subscribe, read, read);
}

// ---------- route table ----------

const OVERLAYS = [
  [/^\/u\/([^/]+)$/, (m) => ({ overlay: "user", id: decodeURIComponent(m[1]) })],
  [/^\/p\/([^/]+)$/, (m) => ({ overlay: "post", id: decodeURIComponent(m[1]) })],
  [/^\/watch\/([^/]+)$/, (m) => ({ overlay: "watch", id: decodeURIComponent(m[1]) })],
];

const PAGES = [
  [/^\/$/, () => ({ tab: "home", section: "foryou" })],
  [/^\/following$/, () => ({ tab: "home", section: "following" })],
  [/^\/flicks(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "flicks", id: m[1] || null })],
  [/^\/news$/, () => ({ tab: "home", section: "news" })],
  [/^\/circles(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "circles", id: m[1] || null })],
  [/^\/gatherings\/([^/]+)$/, (m) => ({ tab: "home", section: "circles", gatheringId: m[1] })],
  [/^\/search$/, () => ({ tab: "home", section: "search" })],
  [/^\/saved$/, () => ({ tab: "home", section: "saved" })],
  [/^\/messages(?:\/([^/]+))?$/, (m) => ({ tab: "messages", id: m[1] || null })],
  [/^\/account$/, () => ({ tab: "account", view: "profile" })],
  [/^\/account\/settings$/, () => ({ tab: "account", view: "settings" })],
  [/^\/legal(?:\/([a-z]+))?$/, (m) => ({ tab: "account", view: "legal", doc: m[1] || "privacy" })],
];

export function matchPage(path) {
  for (const [re, make] of PAGES) {
    const m = path.match(re);
    if (m) return make(m);
  }
  return { tab: "home", section: "foryou", notFound: true };
}

export function matchOverlay(path) {
  for (const [re, make] of OVERLAYS) {
    const m = path.match(re);
    if (m) return make(m);
  }
  return null;
}

/** The page to draw, for an overlay route, whatever it was opened over. */
export function resolve(loc) {
  const overlay = matchOverlay(loc.path);
  if (!overlay) return { page: matchPage(loc.path), overlay: null };
  const bgPath = (loc.bg || "/").split("?")[0];
  return { page: matchPage(bgPath), overlay, bgQuery: new URLSearchParams((loc.bg || "").split("?")[1] || "") };
}

export function postUrl(post) {
  const id = typeof post === "string" ? post : post.id;
  return `${window.location.origin}/p/${encodeURIComponent(id)}`;
}
