import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The Firebase chunk (~590 kB) can't be split safely; see manualChunks.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Vendor chunks for long-term caching across app deploys.
        manualChunks(id) {
          if (!id.includes("node_modules") || /\.css($|\?)/.test(id)) return undefined;
          // Firebase packages have circular imports; splitting them breaks
          // initialisation order. Storage is excluded because it's lazy-loaded.
          if (/@firebase\/storage|firebase\/storage/.test(id)) return undefined;
          // The image checker (TensorFlow.js and its ~6 MB model) loads only when
          // someone picks an image, so it stays out of the preloaded chunks.
          if (/@tensorflow|nsfwjs|\/seedrandom\/|\/long\/|\/buffer\/|\/base64-js\/|\/ieee754\/|\/core-js\//.test(id)) return undefined;
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
