// History API router. Overlay routes (profile, post, player) get their own
// URL but keep the underlying page mounted, so Back returns to it intact.

import { useSyncExternalStore } from "react";
import { siteOrigin } from "./native";

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
 * navigate("/@ana", { overlay: true })        push an overlay over the current page
 * navigate("/search?q=x", { replace: true })  update without a new history entry
 */
export function navigate(to, { replace = false, overlay = false } = {}) {
  const here = window.location.pathname + window.location.search;
  if (to === here && !overlay) return;
    const bg = overlay ? window.history.state?.bg || here : null;
  const state = { depth: replace ? depth() : depth() + 1, ...(bg ? { bg } : {}) };
  if (replace) window.history.replaceState(state, "", to);
  else window.history.pushState(state, "", to);
  emit();
}

/** Swap the address for an equivalent one, keeping history state (overlay background, depth). */
export function replacePath(to) {
  window.history.replaceState(window.history.state, "", to);
  emit();
}

/** history.back() within the app, else navigate to `fallback`. */
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

// Routes

const OVERLAYS = [
  // Profiles are /@handle; /u/<uid> still works for older links.
  [/^\/@([a-z0-9_]{3,30})$/i, (m) => ({ overlay: "user", handle: m[1].toLowerCase() })],
  [/^\/u\/([^/]+)$/, (m) => ({ overlay: "user", id: decodeURIComponent(m[1]) })],
  [/^\/p\/([^/]+)$/, (m) => ({ overlay: "post", id: decodeURIComponent(m[1]) })],
  [/^\/watch\/([^/]+)$/, (m) => ({ overlay: "watch", id: decodeURIComponent(m[1]) })],
];

const PAGES = [
  [/^\/$/, () => ({ tab: "home", section: "foryou" })],
  [/^\/following$/, () => ({ tab: "home", section: "following" })],
  [/^\/flicks(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "flicks", id: m[1] || null })],
  [/^\/news\/desk$/, () => ({ tab: "home", section: "news", view: "desk" })],
  [/^\/news\/write\/([^/]+)$/, (m) => ({ tab: "home", section: "news", view: "write", id: decodeURIComponent(m[1]) })],
  [/^\/news(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "news", id: m[1] ? decodeURIComponent(m[1]) : null })],
  [/^\/circles(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "circles", id: m[1] || null })],
  [/^\/gatherings\/([^/]+)$/, (m) => ({ tab: "home", section: "circles", gatheringId: m[1] })],
  [/^\/search$/, () => ({ tab: "home", section: "search" })],
  [/^\/whats-on$/, () => ({ tab: "home", section: "whatson" })],
  [/^\/rolls(?:\/([^/]+))?$/, (m) => ({ tab: "home", section: "rolls", id: m[1] ? decodeURIComponent(m[1]) : null })],
  [/^\/welcome$/, () => ({ tab: "welcome" })],
  [/^\/help(?:\/([a-z0-9-]+))?$/, (m) => ({ tab: "home", section: "help", id: m[1] || null })],
  // Saved lives on your profile now; old links land there.
  [/^\/saved$/, () => ({ tab: "account", view: "profile", profileTab: "saved" })],
  [/^\/notifications$/, () => ({ tab: "home", section: "notifications" })],
  [/^\/leaderboard$/, () => ({ tab: "home", section: "leaderboard" })],
  [/^\/leaderboard\/g\/([^/]+)$/, (m) => ({ tab: "home", section: "leaderboard", groupId: decodeURIComponent(m[1]) })],
  [/^\/messages(?:\/([^/]+))?$/, (m) => ({ tab: "messages", id: m[1] || null })],
  [/^\/account$/, () => ({ tab: "account", view: "profile" })],
  [/^\/account\/settings$/, () => ({ tab: "account", view: "settings" })],
  [/^\/account\/brick$/, () => ({ tab: "account", view: "brick" })],
  [/^\/account\/moderation$/, () => ({ tab: "account", view: "moderation" })],
  [/^\/account\/archive$/, () => ({ tab: "account", view: "archive" })],
  [/^\/account\/ads$/, () => ({ tab: "account", view: "ads" })],
  [/^\/account\/family$/, () => ({ tab: "account", view: "family" })],
  [/^\/account\/week$/, () => ({ tab: "account", view: "week" })],
  [/^\/account\/stats$/, () => ({ tab: "account", view: "stats" })],
  [/^\/legal(?:\/([a-z]+))?$/, (m) => ({ tab: "account", view: "legal", doc: m[1] || "privacy" })],
  [/^\/(login|signup)$/, (m) => ({ tab: "auth", mode: m[1] })],
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

export function resolve(loc) {
  const overlay = matchOverlay(loc.path);
  if (!overlay) return { page: matchPage(loc.path), overlay: null };
  const bgPath = (loc.bg || "/").split("?")[0];
  return { page: matchPage(bgPath), overlay, bgQuery: new URLSearchParams((loc.bg || "").split("?")[1] || "") };
}

/** Log-in or sign-up URL that returns to the current page. */
export function authPath(mode) {
  const { pathname, search } = window.location;
  if (/^\/(login|signup)$/.test(pathname)) return `/${mode}${search}`;
  const here = pathname + search;
  return here === "/" ? `/${mode}` : `/${mode}?next=${encodeURIComponent(here)}`;
}

/** Where to land after signing in: `next` if it's a page on Mesh, else the current page. */
export function afterAuthPath() {
  const { pathname, search } = window.location;
  if (!/^\/(login|signup)$/.test(pathname)) return pathname + search;
  return safeNext(new URLSearchParams(search).get("next"));
}

/**
 * A `next` path only if it stays on this site. Parsed as a URL, since
 * browsers read "/\evil.com" (and "//evil.com") as another site.
 */
export function safeNext(next, origin = window.location.origin) {
  if (!next || !next.startsWith("/") || /[\\\s]/.test(next)) return "/";
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export function postUrl(post) {
  const id = typeof post === "string" ? post : post.id;
  return `${siteOrigin()}/p/${encodeURIComponent(id)}`;
}
