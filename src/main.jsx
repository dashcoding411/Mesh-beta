import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted fonts: the storage policy promises no third-party font requests.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
// Applies appearance attributes before first render.
import "./lib/appearance";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { ToastProvider } from "./components/ui/Toast.jsx";
import { loadWelcome, opensOnWelcome } from "./lib/firstVisit";
import { startNative, isNativeApp } from "./lib/native";
// Catches the browser's install prompt before anything else can miss it.
import "./lib/install";
import { registerServiceWorker } from "./lib/push";
import "./index.css";

const start = () => ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
// On a first visit the welcome page is already on screen, from the HTML. The
// app takes over once its own copy can replace it in one step, with no
// loading screen in between.
if (opensOnWelcome()) loadWelcome().then(start, start);
else start();

startNative();
// The service worker only shows notifications; the iPhone app shell has its own.
if (!isNativeApp) registerServiceWorker();
