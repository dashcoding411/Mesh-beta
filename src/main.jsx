import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted fonts: the storage policy promises no third-party font requests.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
// Applies appearance attributes before first render.
import "./lib/appearance";
import App from "./App.jsx";
import { ToastProvider } from "./components/ui/Toast.jsx";
import { startNative, isNativeApp } from "./lib/native";
// Catches the browser's install prompt before anything else can miss it.
import "./lib/install";
import { registerServiceWorker } from "./lib/push";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);

startNative();
// The service worker only shows notifications; the iPhone app shell has its own.
if (!isNativeApp) registerServiceWorker();
