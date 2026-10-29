// Installing Mesh like an app. Android and desktop Chrome offer an install
// prompt, which is caught here so Mesh can show it from a button. iPhones
// have no prompt: people add Mesh from Safari's Share menu, and only then can
// it send notifications (Apple's rule for web apps).

import { useEffect, useState } from "react";
import { isNativeApp } from "./native";

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // Mesh shows its own button instead of the browser's banner
    deferred = e;
    emit();
  });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); });
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac with a touch screen.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Running from the home screen or as an installed app (the iPhone app too). */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  if (isNativeApp) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

/** "installed" | "prompt" (the browser can install it) | "ios" (show Share-menu steps) | "unavailable". */
export function installState() {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "unavailable";
}

/** Shows the browser's install prompt. Resolves to true if installed. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}

export function useInstallState() {
  const [state, setState] = useState(installState);
  useEffect(() => {
    const on = () => setState(installState());
    listeners.add(on);
    return () => listeners.delete(on);
  }, []);
  return state;
}
