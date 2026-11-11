// Serves the production build (dist/) on http://localhost:4174 with exactly
// the headers Firebase Hosting sends (read from firebase.json), including the
// Content-Security-Policy, so a policy change can be tested before deploying.
//   npm run build && node scripts/preview-prod.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname;
const hosting = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8")).hosting;
const globalHeaders = Object.fromEntries(hosting.headers.find((h) => h.source === "**").headers.map((h) => [h.key, h.value]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  // Like Hosting: a file, else a folder's index.html (the prerendered
  // pages), else the app's index.html.
  const isFile = async (f) => { try { return (await stat(f)).isFile(); } catch { return false; } };
  let status = 200;
  if (!(await isFile(file))) {
    // A built file that isn't there is a 404, as the "!/assets/**" rewrite makes it on Hosting.
    if (url.startsWith("/assets/")) { status = 404; file = join(root, "404.html"); }
    else file = (await isFile(join(file, "index.html"))) ? join(file, "index.html") : join(root, "index.html");
  }
  const body = await readFile(file);
  res.writeHead(status, { ...globalHeaders, "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(body);
}).listen(4174, () => console.log("Production preview on http://localhost:4174"));
