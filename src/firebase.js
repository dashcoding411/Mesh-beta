import { initializeApp } from "firebase/app";
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
export const auth = getAuth(app);
// Long polling avoids hangs behind proxies/sandboxes that break streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
export const storage = getStorage(app);
