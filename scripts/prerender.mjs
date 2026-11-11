// Post-build: renders the home page, the policy pages, the welcome page and
// What's on to static HTML (title, description, canonical URL, content) and
// writes sitemap.xml. The app replaces the content once it loads. The home
// page's HTML is also what every other app route starts from.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { DOCUMENTS } from "../src/legal/content.js";
import { BUSINESS } from "../src/legal/business.js";

export const SITE_URL = "https://joinmesh.social";
const dist = new URL("../dist/", import.meta.url);

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderDoc(doc) {
  const sections = doc.sections.map((sec) => [
    sec.h ? `<h2 class="mt-10 text-title-2">${esc(sec.h)}</h2>` : "",
    ...(sec.p || []).map((para) => `<p class="mt-3 text-body text-fg-muted">${esc(para)}</p>`),
    sec.list ? `<dl class="mt-4 space-y-3">${sec.list.map(([term, def]) =>
      `<div><dt class="text-callout font-semibold">${esc(term)}</dt><dd class="text-body text-fg-muted">${esc(def)}</dd></div>`).join("")}</dl>` : "",
  ].join("")).join("\n");
  return `<main class="mx-auto max-w-2xl px-6 py-12">
        <p><a href="/" class="font-display text-title-3 font-extrabold">Mesh</a></p>
        <article class="mt-8">
          <h1 class="font-display text-title-1">${esc(doc.title)}</h1>
          <p class="mt-2 text-caption text-fg-subtle">Last updated ${esc(BUSINESS.lastUpdated)}</p>
          <p class="mt-4 text-body">${esc(doc.summary)}</p>
          ${sections}
        </article>
        <nav aria-label="Policies" class="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-callout text-fg-muted">
          ${DOCUMENTS.map((d) => `<a href="/legal/${d.id}">${esc(d.title)}</a>`).join("\n          ")}
        </nav>
      </main>`;
}

function page(template, { path, canonical = path, title, description, body }) {
  const url = `${SITE_URL}${canonical}`;
  const out = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    // A function, so a "$" in the content is never read as a replacement pattern.
    .replace(/<div id="root">[\s\S]*?<\/div>\s*(<script|<\/body>)/, (_, next) => `<div id="root">\n      ${body}\n    </div>\n    ${next}`);
  for (const [needle, what] of [[`<title>${esc(title)}</title>`, "title"], [url, "canonical"], [body.slice(0, 40), "body"]]) {
    if (!out.includes(needle)) throw new Error(`prerender: ${what} didn't make it into ${path}`);
  }
  return out;
}

/**
 * The welcome page and the loading logo, drawn from the app's own components
 * (through Vite, which understands their JSX), so what arrives in the HTML is
 * exactly what the app shows a moment later and can't drift from it.
 * src/boot.js and the [data-boot] rules in index.css choose which of the two
 * is on screen before the app starts. Those components, and what they
 * import, must load without a browser; if one stops doing so, the build
 * fails here and says which.
 */
async function drawWelcome() {
  const vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const [{ default: Welcome }, { Splash }] = await Promise.all([
      vite.ssrLoadModule("/src/components/Welcome.jsx"),
      vite.ssrLoadModule("/src/components/ui/LogoMark.jsx"),
    ]);
    // One pass, so the two logos get different gradient ids (see LogoMark).
    const html = renderToStaticMarkup(h(Fragment, null,
      h("div", { "data-boot": "splash" }, h(Splash)),
      h("div", { "data-boot": "welcome" }, h(Welcome, { signedIn: false })),
    ));
    return `<noscript><p class="bg-surface-2 px-4 py-3 text-center text-callout">Mesh needs JavaScript switched on to sign in and use it.</p></noscript>\n      ${html}`;
  } finally {
    await vite.close();
  }
}

const template = await readFile(new URL("index.html", dist), "utf8");
const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: `${SITE_URL}/`, priority: "1.0" }];

// Public pages people land on from search and shared links.
const PAGES = [
  {
    path: "/welcome",
    // Same text as the home page, so search engines treat them as one.
    canonical: "/",
    title: "Mesh: social media for humans",
    description: "Rolls: a shared disposable camera for every night out that develops at 9am. Plus real news, and an app that knows when to stop. 16+.",
    body: await drawWelcome(),
  },
  {
    path: "/whats-on",
    priority: "0.8",
    title: "What's on · Mesh",
    description: "Runs, dinners, gigs and meetups people are putting on, by day. See what's on near you, no account needed.",
    body: `<main class="mx-auto max-w-2xl px-6 py-12">
        <p><a href="/" class="font-display text-title-3 font-extrabold">Mesh</a></p>
        <h1 class="mt-8 font-display text-title-1">What's on</h1>
        <p class="mt-4 text-body text-fg-muted">Runs, dinners, gigs and meetups people are putting on. Public gatherings only. Anyone can look, and replying is free with a Mesh account.</p>
      </main>`,
  },
];

// The home page: the welcome text, so it isn't an empty shell before the app starts.
const welcome = PAGES.find((p) => p.path === "/welcome");
const home = page(template, { ...welcome, path: "/", title: "Mesh: social media for humans" });

for (const p of PAGES) {
  const dir = new URL(`${p.path.slice(1)}/`, dist);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page(template, p));
  if (!p.canonical) urls.push({ loc: `${SITE_URL}${p.path}`, priority: p.priority });
}

for (const doc of DOCUMENTS) {
  const path = `/legal/${doc.id}`;
  const dir = new URL(`legal/${doc.id}/`, dist);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page(template, {
    path, title: `${doc.title} · Mesh`, description: doc.summary, body: renderDoc(doc),
  }));
  urls.push({ loc: `${SITE_URL}${path}`, priority: "0.3" });
}

await writeFile(new URL("index.html", dist), home);

await writeFile(new URL("sitemap.xml", dist), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`);

console.log(`prerender: ${DOCUMENTS.length} policy pages, ${PAGES.length} public pages and sitemap.xml (${urls.length} URLs)`);
