// Cookie and storage choices. Essential storage (signing in, anti-spam, your
// settings) is always on. The optional extras below come from other companies
// and stay off until someone says yes; nothing is assumed from browsing.
import { useSyncExternalStore } from "react";
import { gifsEnabled } from "./gifs";

const KEY = "mesh:consent";
const VERSION = 1;

/** The optional extras this build uses. */
export function optionalItems() {
  return [
    {
      id: "recaptcha",
      label: "Google security check",
      body: "Google reCAPTCHA checks that visits come from a real browser, not a script. Google sets its own cookies for it and sees your browser and device details.",
    },
    ...(gifsEnabled ? [{
      id: "giphy",
      label: "GIFs from GIPHY",
      body: "Searching and showing GIFs loads them from GIPHY, which sees your IP address and your search words.",
    }] : []),
  ];
}

const listeners = new Set();
let current = read();

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    return saved?.v === VERSION ? saved : null;
  } catch {
    return null;
  }
}

/** null until a choice has been made. */
export const readConsent = () => current;
export const allowed = (id) => !!current?.[id];

export function setConsent(choices) {
  current = { v: VERSION, ...Object.fromEntries(optionalItems().map((i) => [i.id, !!choices[i.id]])), at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked: applies for this visit */ }
  listeners.forEach((fn) => fn(current));
}

export const allowAll = () => setConsent(Object.fromEntries(optionalItems().map((i) => [i.id, true])));
export const essentialOnly = () => setConsent({});

export function onConsent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useConsent() {
  return useSyncExternalStore(onConsent, readConsent, () => null);
}

export const CHOICES_EVENT = "mesh:cookie-choices";
/** Opens the choices dialog (from Settings or the Cookies policy). */
export const openCookieChoices = () => window.dispatchEvent(new CustomEvent(CHOICES_EVENT));
