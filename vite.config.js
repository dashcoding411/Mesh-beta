import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import licenses from "./scripts/licenses-plugin.mjs";

// When this copy of Mesh was built, shown at the bottom of Settings, so anyone
// can tell whether they have the newest one (Brisbane time). It goes in the
// HTML (lib/built.js reads it), not the scripts: the same code then builds to
// the same file names every time, so a deploy only makes people download what
// actually changed, and only then offers them the reload.
const BUILT = new Date().toLocaleString("en-AU", {
  timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

// Set MESH_SALT to anything (letters and digits) to give every built file a
// new name, for when a cache in front of the site is holding something wrong
// under the current names (README, Deployment).
const SALT = (process.env.MESH_SALT || "").replace(/\W/g, "");

// What the HTML asks for ahead of the app's own script:
// - src/boot.js, as a classic script that runs before the first paint;
// - the welcome page's code, which a first visit opens on, and the two fonts
//   every page uses, fetched alongside the app rather than after it.
function early() {
  return {
    name: "mesh-early",
    apply: "build",
    buildStart() {
      const source = readFileSync(new URL("./src/boot.js", import.meta.url), "utf8")
        .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
      this.emitFile({ type: "asset", name: "boot.js", source });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, { bundle }) {
        const files = Object.values(bundle || {});
        const named = (re) => files.find((f) => re.test(f.fileName))?.fileName;
        const boot = named(/^assets\/boot-[\w-]+\.js$/);
        const welcome = files.find((f) => f.type === "chunk" && f.name === "Welcome")?.fileName;
        const fonts = [/inter-latin-wght-normal-[\w-]+\.woff2$/, /plus-jakarta-sans-latin-wght-normal-[\w-]+\.woff2$/].map(named);
        if (!boot || !welcome || fonts.some((f) => !f)) throw new Error("mesh-early: boot.js, the welcome page or a font is missing from the build");
        return [
          { tag: "meta", attrs: { name: "mesh-built", content: BUILT }, injectTo: "head" },
          { tag: "script", attrs: { src: `/${boot}` }, injectTo: "head" },
          { tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${welcome}` }, injectTo: "head" },
          ...fonts.map((f) => ({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: true, href: `/${f}` }, injectTo: "head" })),
        ];
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), licenses(), early()],
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
        ...(SALT && {
          entryFileNames: `assets/[name]-[hash]${SALT}.js`,
          chunkFileNames: `assets/[name]-[hash]${SALT}.js`,
          assetFileNames: `assets/[name]-[hash]${SALT}[extname]`,
        }),
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
          // The QR reader loads only when someone opens the roll scanner, and
          // the QR maker only when a roll's code is shown.
          if (/\/(jsqr|qrcode|dijkstrajs)\//.test(id)) return undefined;
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
