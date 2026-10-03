import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { isNativeApp } from "./lib/native";
import { allowed, onConsent } from "./lib/consent";

// Google's account picker names this domain. To show joinmesh.social, add
// https://joinmesh.social/__/auth/handler as a redirect URI on the project's
// OAuth web client in Google Cloud, then use "joinmesh.social" here when
// location.hostname is joinmesh.social. Until then it must stay as is, or
// Google sign-in fails with redirect_uri_mismatch.
const AUTH_DOMAIN = "mesh-a293c.firebaseapp.com";

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

export const auth = getAuth(app);
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
