import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The Firebase SDK alone is ~610 kB (~180 kB gzipped) and can't be split
    // safely (see below); everything of ours is well under the default 500.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Libraries change far less often than the app, so they get their own
        // files: after an app update, returning visitors re-download only the
        // app code, not Firebase and React too.
        manualChunks(id) {
          // Stylesheets (the self-hosted fonts) stay with the app's CSS file.
          if (!id.includes("node_modules") || /\.css($|\?)/.test(id)) return undefined;
          // Firebase stays in one file: its packages import each other in a
          // cycle, and splitting them across files breaks start-up order
          // ("Cannot access ... before initialization"). idb and re2js are
          // libraries only Firebase uses.
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
