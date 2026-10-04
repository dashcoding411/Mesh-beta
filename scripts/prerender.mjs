// Post-build: renders the policy pages, the welcome page and What's on to
// static HTML (title, description, canonical URL, text) and writes sitemap.xml.
// The app replaces the text once it loads.

import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function page(template, { path, title, description, body }) {
  const url = `${SITE_URL}${path}`;
  const out = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/<div id="root">[\s\S]*?<\/div>\s*(<script|<\/body>)/, `<div id="root">\n      ${body}\n    </div>\n    $1`);
  for (const [needle, what] of [[`<title>${esc(title)}</title>`, "title"], [url, "canonical"], [body.slice(0, 40), "body"]]) {
    if (!out.includes(needle)) throw new Error(`prerender: ${what} didn't make it into ${path}`);
  }
  return out;
}

const template = await readFile(new URL("index.html", dist), "utf8");
const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: `${SITE_URL}/`, priority: "1.0" }];

// Public pages people land on from search and shared links.
const PAGES = [
  {
    path: "/welcome",
    priority: "0.9",
    title: "Mesh: social media for humans",
    description: "Real people, real news and real plans, in an app that knows when to stop. Set a daily limit and Mesh locks itself when you hit it. 16+.",
    body: `<main class="mx-auto max-w-2xl px-6 py-12">
        <p class="font-display text-title-3 font-extrabold">Mesh</p>
        <h1 class="mt-8 font-display text-title-1">Social media for humans.</h1>
        <p class="mt-2 text-title-3">Get bored again.</p>
        <p class="mt-4 text-body text-fg-muted">Real people, real news and real plans, in an app that knows when to stop.</p>
        <h2 class="mt-10 text-title-2">You control the scroll</h2>
        <p class="mt-3 text-body text-fg-muted">Pick a daily limit when you sign up. When you hit it, Home and Flicks lock until midnight, with no ignore button. Loosening a limit takes 24 hours. Messages and calls always work.</p>
        <h2 class="mt-10 text-title-2">Made by humans</h2>
        <p class="mt-3 text-body text-fg-muted">AI-generated photos and videos aren't allowed. Editing your own photos is fine. Fakes aren't.</p>
        <h2 class="mt-10 text-title-2">Real news</h2>
        <p class="mt-3 text-body text-fg-muted">Mesh News is written by journalists whose identity is verified. Every story cites its sources.</p>
        <h2 class="mt-10 text-title-2">Mesh together</h2>
        <p class="mt-3 text-body text-fg-muted">Circles are communities with their own rules. Gatherings get you off your phone. <a href="/whats-on">See what's on</a>.</p>
        <h2 class="mt-10 text-title-2">Hate stopped at the door</h2>
        <p class="mt-3 text-body text-fg-muted">Slurs and attacks are stopped before they post. Every block can be appealed to a person.</p>
        <h2 class="mt-10 text-title-2">Not greedy</h2>
        <p class="mt-3 text-body text-fg-muted">Ads are labelled and never track what you do. Your data is never sold.</p>
        <p class="mt-10"><a href="/signup">Sign up, it's free</a> · <a href="/">Look around</a></p>
      </main>`,
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

for (const p of PAGES) {
  const dir = new URL(`${p.path.slice(1)}/`, dist);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page(template, p));
  urls.push({ loc: `${SITE_URL}${p.path}`, priority: p.priority });
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

await writeFile(new URL("sitemap.xml", dist), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`);

console.log(`prerender: ${DOCUMENTS.length} policy pages, ${PAGES.length} public pages and sitemap.xml (${urls.length} URLs)`);
