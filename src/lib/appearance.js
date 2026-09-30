// Per-device display preferences (localStorage "mesh:appearance"), applied
// as data attributes on <html> before first render.

import { useSyncExternalStore } from "react";

const KEY = "mesh:appearance";
export const DEFAULTS = { theme: "system", text: "default", motion: "system", autoplay: "on" };

export const OPTIONS = {
  theme: [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ],
  text: [
    { id: "default", label: "Default" },
    { id: "large", label: "Large" },
    { id: "larger", label: "Larger" },
  ],
  motion: [
    { id: "system", label: "Follow system" },
    { id: "reduce", label: "Reduce" },
  ],
  autoplay: [
    { id: "on", label: "Autoplay" },
    { id: "off", label: "Tap to play" },
  ],
};

let prefs = read();
const listeners = new Set();
const systemDark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const systemReduce = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) =>
      [k, OPTIONS[k].some((o) => o.id === saved[k]) ? saved[k] : d]));
  } catch {
    return { ...DEFAULTS };
  }
}

export function resolvedTheme(p = prefs) {
  if (p.theme !== "system") return p.theme;
  return systemDark?.matches === false ? "light" : "dark";
}

export function motionReduced(p = prefs) {
  return p.motion === "reduce" || !!systemReduce?.matches;
}

export function autoplayAllowed(p = prefs) {
  return p.autoplay === "on" && !motionReduced(p);
}

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // CSS handles "system" before JS runs; this keeps the attribute exact afterwards.
  root.dataset.theme = resolvedTheme();
  if (prefs.text === "default") delete root.dataset.text;
  else root.dataset.text = prefs.text;
  if (prefs.motion === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
  const bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.setAttribute("content", resolvedTheme() === "light" ? "#f7f7f8" : "#09090b");
}

function emit() {
  apply();
  listeners.forEach((fn) => fn());
}

export function setAppearance(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked: applies for this visit */ }
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAppearance() {
  return useSyncExternalStore(subscribe, () => prefs, () => DEFAULTS);
}

systemDark?.addEventListener?.("change", emit);
systemReduce?.addEventListener?.("change", emit);
apply();
