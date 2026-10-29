// The iPhone app (Capacitor) runs this same web app inside a native shell.
// Everything here is a no-op on the website.
import { Capacitor, registerPlugin } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform();

// Google and Apple sign-in, done natively (ios/App/App/MeshSignIn.swift):
// Google won't sign anyone in inside an app's web view. Google's client is
// the Firebase iOS app's (com.meshsocial.app), public like the web config.
// Apple needs the Sign in with Apple capability, which needs an Apple
// Developer Program membership, and the App Store needs Apple whenever
// Google is offered: turn it on before the first upload.
const MeshSignIn = registerPlugin("MeshSignIn");
const GOOGLE_IOS_CLIENT = "173524995677-9u7j7aaq20d2dvg3e93a360dcpt9ao4d.apps.googleusercontent.com";
export const APPLE_IN_APP = false;

/** { idToken } from Google, or { idToken, rawNonce } from Apple. Rejects with code "cancelled" when backed out of. */
export function nativeSignIn(provider) {
  return provider === "google" ? MeshSignIn.google({ clientId: GOOGLE_IOS_CLIENT }) : MeshSignIn.apple();
}

/**
 * Mesh's web address, for anything that leaves the app: shared links, and
 * where an email's link comes back to. The app's own pages load from
 * capacitor://localhost, which means nothing anywhere else.
 */
export const WEBSITE = "https://joinmesh.social";
export const siteOrigin = () => (isNativeApp || typeof window === "undefined" ? WEBSITE : window.location.origin);

/**
 * The status bar sits above Mesh (capacitor.config.json), as Safari's and
 * M.A.T.H's do, on the page's colour (the theme-color tag, which
 * appearance.js keeps in step); the launch screen hides once Mesh has drawn.
 */
export async function startNative() {
  if (!isNativeApp) return;
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);
  const bar = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const light = document.documentElement.dataset.theme === "light";
    // Style.Dark means light text, for dark backgrounds.
    StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: bar?.content || (light ? "#f7f7f8" : "#09090b") }).catch(() => {});
  };
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (bar) new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ["content"] });
  requestAnimationFrame(() => SplashScreen.hide().catch(() => {}));
}

let haptics = null;
/** A light tap, for likes and other small confirmations. */
export function tap() {
  if (!isNativeApp) return;
  haptics ||= import("@capacitor/haptics");
  haptics.then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
}
