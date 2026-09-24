import React from "react";
import ReactDOM from "react-dom/client";
/* Fonts are self-hosted: the files ship in our own bundle, so no request goes
   to Google Fonts or any other third party. The Cookies & Storage policy
   promises exactly that, a CDN font would quietly break the promise. */
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import App from "./App.jsx";
import { ToastProvider } from "./components/ui/Toast.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
