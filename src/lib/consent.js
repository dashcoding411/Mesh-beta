// Cookie and storage choices. Essential storage (signing in, the bot check,
// your settings) is always on. The optional extras below come from other
// companies and stay off until someone says yes; nothing is assumed from browsing.
import { useSyncExternalStore } from "react";
import { gifsEnabled } from "./gifs";
import { adsenseEnabled } from "./adsense";

const KEY = "mesh:consent";
const VERSION = 1;

/** The optional extras this build uses. */
export function optionalItems() {
  return [
    ...(gifsEnabled ? [{
      id: "giphy",
      label: "GIFs from GIPHY",
      body: "Searching and showing GIFs loads them from GIPHY, which sees your IP address and your search words.",
    }] : []),
    ...(adsenseEnabled ? [{
      id: "googleads",
      label: "Google ads",
      body: "When no local ad is booked, some ad spaces in Home are filled by Google AdSense (18 and over only). Google and its partners set cookies and see your IP address and browser to show, count and limit ads and to stop fraud. Mesh asks for ads that aren't personalised.",
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
