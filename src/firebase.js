import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence, indexedDBLocalPersistence, initializeAuth,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { isNativeApp } from "./lib/native";

// Where Google and Apple sign-in run. On joinmesh.social it should be the
// site itself: Safari blocks the cross-site storage the firebaseapp.com
// helper needs, which makes sign-in slow, loses the result after a redirect,
// and breaks it in the iPhone home-screen app. Google's account picker also
// names this domain. Firebase Hosting serves the helper on our domain
// (/__/auth/handler), but Google has to allow it first: the OAuth web client
// in Google Cloud must list https://joinmesh.social/__/auth/handler (and the
// www one) as redirect URIs (done 7 October 2026). Elsewhere (local
// development, the web.app address) it stays on firebaseapp.com.
const SITE_AUTH = true;
const SITE_AUTH_HOSTS = ["joinmesh.social", "www.joinmesh.social"];
const FIREBASE_AUTH_DOMAIN = "mesh-a293c.firebaseapp.com";
const AUTH_DOMAIN = SITE_AUTH && typeof location !== "undefined" && SITE_AUTH_HOSTS.includes(location.hostname)
  ? location.hostname : FIREBASE_AUTH_DOMAIN;
/** Sign-in runs on this site, so a full-page redirect works in every browser. */
export const sameSiteAuth = AUTH_DOMAIN !== FIREBASE_AUTH_DOMAIN;

// Public client config; access control is in firestore.rules and storage.rules.
const firebaseConfig = {
  apiKey: "AIzaSyAjbyWWaYdJSdX4m3hTYcuhiroD_RHDiGI",
  authDomain: AUTH_DOMAIN,
  projectId: "mesh-a293c",
  storageBucket: "mesh-a293c.firebasestorage.app",
  messagingSenderId: "173524995677",
  appId: "1:173524995677:web:5635f47444ad2a6edd47b4",
  // No measurementId: Mesh never uses Google Analytics.
};

const app = initializeApp(firebaseConfig);

// App Check (reCAPTCHA Enterprise). The site key is public. Enforcement is
// configured in the console; set the key before enabling it.
const APP_CHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "6Lfc89ItAAAAAM_UoSuReQkPRwbkFe5m0KXcI7Rb";
const APP_CHECK_PROVIDER = import.meta.env.VITE_APPCHECK_PROVIDER || "enterprise"; // "enterprise" | "v3"

// The bot check is essential security, like signing in, so it runs for
// everyone (the privacy policy and cookie notice say so). It only runs on
// approved websites, so the iPhone app skips it; that will use App Attest once
// App Check is enforced.
//
// It starts a few seconds after Mesh is on screen (App.jsx), not as it
// opens: while App Check runs, every sign-in and database request waits for
// a reCAPTCHA token first, and loading reCAPTCHA takes a second or more
// (several on a phone, and a Google sign-in in M.A.T.H could fail as a
// network error waiting for it). App Check isn't enforced, so requests
// before then are only counted as unverified. Before enforcing it, start it
// earlier for the requests that need it.
let appCheckHeld = true;
let appCheckStarted = false;
/** Lets the security check start (once Mesh is on screen). */
export function releaseAppCheck() {
  if (!appCheckHeld) return;
  appCheckHeld = false;
  startAppCheck();
}
setTimeout(releaseAppCheck, 30_000);
async function startAppCheck() {
  if (appCheckHeld || appCheckStarted || !APP_CHECK_SITE_KEY || typeof window === "undefined" || isNativeApp) return;
  appCheckStarted = true;
  // Local dev uses a registered debug token from .env.local (dev builds only).
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  const { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } = await import("firebase/app-check");
  initializeAppCheck(app, {
    provider: APP_CHECK_PROVIDER === "enterprise"
      ? new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
      : new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}


// Without a popup/redirect resolver here. Given one, Firebase loads Google's
// sign-in frame and script on every page in Safari and on every phone, and
// holds back the signed-in user until they arrive (a second or more, longer
// in Safari). lib/auth.js passes the resolver only when someone signs in.
// The exception is arriving back from Google's page (the iPhone home-screen
// app signs in that way): then Firebase finishes the sign-in as it starts,
// so Mesh opens signed in, instead of opening signed out and reloading.
//
// M.A.T.H (Mesh added to an iPhone's home screen) never uses Firebase's
// redirect: Google comes back by Mesh's own route (lib/auth.js), and Apple
// sign-in is off. A Firebase redirect note left by an older version would
// send it through Firebase's hidden frame, which times out there ("Can't
// reach the network"), so it's cleared.
export const homeScreenIOS = (() => {
  try {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return ios && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
  } catch { return false; }
})();
// Whether a signed-in account was stored when Mesh opened (M.A.T.H keeps it
// in local storage), for explaining an unexpected sign-out (lib/auth.js).
export const storedSignInAtStart = (() => {
  try { return Object.keys(localStorage).some((k) => k.startsWith("firebase:authUser:")); } catch { return false; }
})();
const returningFromSignIn = (() => {
  try {
    const notes = Object.keys(sessionStorage).filter((k) => k.startsWith("firebase:pendingRedirect"));
    if (homeScreenIOS) { notes.forEach((k) => sessionStorage.removeItem(k)); return false; }
    return notes.length > 0;
  } catch { return false; }
})();
// In M.A.T.H, sign-ins are kept in local storage, not IndexedDB: on iPhones
// a home-screen app's IndexedDB often stops answering after the app is left
// and reopened (as on the trip to Google), and Firebase then waits on it
// until sign-in fails as a network error. Elsewhere IndexedDB comes first.
export const auth = initializeAuth(app, {
  persistence: homeScreenIOS
    ? [browserLocalPersistence, browserSessionPersistence]
    : [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  ...(returningFromSignIn ? { popupRedirectResolver: browserPopupRedirectResolver } : {}),
});
// Auto-detected long polling for proxies that break streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// Storage is lazy-loaded (off on the Spark plan). The 8s retry cap applies
// to reads such as the availability probe.
let storageModule = null;
export function loadStorage() {
  storageModule ||= import("firebase/storage").then((mod) => {
    const storage = mod.getStorage(app);
    storage.maxOperationRetryTime = 8000;
    return { ...mod, storage };
  });
  return storageModule;
}
