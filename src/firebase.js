import { initializeApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { isNativeApp } from "./lib/native";
import { allowed, onConsent } from "./lib/consent";

// Where Google and Apple sign-in run. On joinmesh.social it should be the
// site itself: Safari blocks the cross-site storage the firebaseapp.com
// helper needs, which makes sign-in slow, loses the result after a redirect,
// and breaks it in the iPhone home-screen app. Google's account picker also
// names this domain. Firebase Hosting serves the helper on our domain
// (/__/auth/handler), but Google has to allow it first: the OAuth web client
// in Google Cloud must list https://joinmesh.social/__/auth/handler (and the
// www one) as redirect URIs. Until SITE_AUTH is true, it stays on
// firebaseapp.com, or Google sign-in fails with redirect_uri_mismatch.
const SITE_AUTH = false;
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

// reCAPTCHA sets Google cookies, so it starts only once someone allows the
// security check (lib/consent.js), never by default. It only runs on approved
// websites, so the iPhone app skips it; that will use App Attest once App
// Check is enforced. Its code loads only then, so most visitors never download it.
let appCheckStarted = false;
async function startAppCheck() {
  if (appCheckStarted || !APP_CHECK_SITE_KEY || typeof window === "undefined" || isNativeApp) return;
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
if (allowed("recaptcha")) startAppCheck();
onConsent((choice) => { if (choice?.recaptcha) startAppCheck(); });

// Without a popup/redirect resolver here. Given one, Firebase loads Google's
// sign-in frame and script on every page in Safari and on every phone, and
// holds back the signed-in user until they arrive (a second or more, longer
// in Safari). lib/auth.js passes the resolver only when someone signs in.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
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
