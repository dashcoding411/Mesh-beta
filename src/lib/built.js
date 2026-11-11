// When this copy of Mesh was built (Brisbane time), for "Version" in Settings
// and on the sign-in page. The build writes it into the page's HTML
// (vite.config.js) rather than into the scripts, so it doesn't change their
// names; from source there's no build, so it says so.
export const BUILT = (typeof document !== "undefined" && document.querySelector('meta[name="mesh-built"]')?.content) || "development";
