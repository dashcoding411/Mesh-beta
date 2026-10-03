// The iPhone app (Capacitor) runs this same web app inside a native shell.
// Everything here is a no-op on the website.
import { Capacitor } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform();

/** Status bar follows the theme; the launch screen hides once Mesh has drawn. */
export async function startNative() {
  if (!isNativeApp) return;
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);
  // Style.Dark means light text, for dark backgrounds.
  const sync = () => StatusBar.setStyle({
    style: document.documentElement.dataset.theme === "light" ? Style.Light : Style.Dark,
  }).catch(() => {});
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  requestAnimationFrame(() => SplashScreen.hide().catch(() => {}));
}

let haptics = null;
/** A light tap, for likes and other small confirmations. */
export function tap() {
  if (!isNativeApp) return;
  haptics ||= import("@capacitor/haptics");
  haptics.then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
}
