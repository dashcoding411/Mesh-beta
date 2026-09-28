import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase web config is safe to ship to clients; access control lives in
// firestore.rules / storage.rules, which must be deployed alongside the app.
const firebaseConfig = {
  apiKey: "AIzaSyAjbyWWaYdJSdX4m3hTYcuhiroD_RHDiGI",
  authDomain: "mesh-a293c.firebaseapp.com",
  projectId: "mesh-a293c",
  storageBucket: "mesh-a293c.firebasestorage.app",
  messagingSenderId: "173524995677",
  appId: "1:173524995677:web:5635f47444ad2a6edd47b4",
  measurementId: "G-PX8VHYKKSC",
};

const app = initializeApp(firebaseConfig);

// App Check: every request carries proof it came from this site, running in a
// real browser (reCAPTCHA scores it invisibly, no puzzles). Once enforcement
// is switched on in the Firebase console, scripts calling the API directly
// with the config above are refused, whatever account they use.
//
// The site key is public by design, like the config above. It must be set
// before enforcement is turned on, or every request will be refused.
const APP_CHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "6Lfc89ItAAAAAM_UoSuReQkPRwbkFe5m0KXcI7Rb";
const APP_CHECK_PROVIDER = import.meta.env.VITE_APPCHECK_PROVIDER || "enterprise"; // "enterprise" | "v3"

if (APP_CHECK_SITE_KEY && typeof window !== "undefined") {
  // On localhost, reCAPTCHA only works if localhost is on the key's domain
  // list. Otherwise put a debug token (registered under App Check > Manage
  // debug tokens) in .env.local as VITE_APPCHECK_DEBUG_TOKEN. Never in builds.
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  initializeAppCheck(app, {
    provider: APP_CHECK_PROVIDER === "enterprise"
      ? new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
      : new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
// Long polling avoids hangs behind proxies/sandboxes that break streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
export const storage = getStorage(app);
// Reads (like the one-off check for whether Storage is switched on) give up
// after 8 seconds instead of retrying for two minutes. Uploads keep their
// own, longer retry window.
storage.maxOperationRetryTime = 8000;
