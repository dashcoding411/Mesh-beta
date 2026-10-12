import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import licenses from "./scripts/licenses-plugin.mjs";

// When this copy of Mesh was built, shown at the bottom of Settings, so anyone
// can tell whether they have the newest one (Brisbane time).
const BUILT = new Date().toLocaleString("en-AU", {
  timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), licenses()],
  define: { "import.meta.env.VITE_BUILT": JSON.stringify(BUILT) },
  resolve: {
    // Firestore's regex engine for pipeline queries, which Mesh doesn't use.
    alias: [{ find: /^re2js$/, replacement: fileURLToPath(new URL("./src/lib/re2jsStub.js", import.meta.url)) }],
  },
  build: {
    // The Firebase chunk (~430 kB) can't be split safely; see manualChunks. The
    // image checker's TensorFlow chunk (~1.1 MB) is over this on purpose: it
    // loads only when someone picks a photo, so its warning is expected.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Vendor chunks for long-term caching across app deploys.
        manualChunks(id) {
          if (!id.includes("node_modules") || /\.css($|\?)/.test(id)) return undefined;
          // Firebase packages have circular imports; splitting them breaks
          // initialisation order. Storage and App Check are excluded because
          // they're lazy-loaded (App Check only after someone allows it).
          if (/@firebase\/(storage|app-check)|firebase\/(storage|app-check)/.test(id)) return undefined;
          // The image checker (TensorFlow.js and its ~6 MB model) loads only when
          // someone picks an image, so it stays out of the preloaded chunks.
          if (/@tensorflow|nsfwjs|\/seedrandom\/|\/long\/|\/buffer\/|\/base64-js\/|\/ieee754\/|\/core-js\//.test(id)) return undefined;
          // The QR reader loads only when someone opens the roll scanner.
          if (/\/jsqr\//.test(id)) return undefined;
          if (/firebase|\/idb\/|\/re2js\//.test(id)) return "firebase";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
