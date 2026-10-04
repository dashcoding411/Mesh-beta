// Mesh edge: Mesh is a single-page app, so link previewers (WhatsApp,
// iMessage, Instagram, X, Discord) and search engines that don't run its code
// see the same generic page for every link. This Worker sits in front of
// Firebase Hosting for shareable paths and writes the right title,
// description, image and structured data into the page's <head>, reading
// only what a signed-out visitor could already see (Firestore's REST API,
// unauthenticated, so the security rules decide). People get the normal app.

const PAGE = /^\/(news|p|u|gatherings|circles|rolls)\/([^/?#]+)\/?$|^\/@([a-z0-9_]{3,30})\/?$/i;
const FALLBACK_IMAGE = "/og-image.png";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/sitemap-news.xml") return cached(req, ctx, () => sitemap(env));
      if (url.pathname === "/sitemap-gatherings.xml") return cached(req, ctx, () => gatheringsSitemap(env));
      const media = url.pathname.match(/^\/og\/media\/([A-Za-z0-9_-]{1,64})$/);
      if (media) return cached(req, ctx, () => inlineImage(env, media[1]));

      const origin = await fetch(req);
      const m = url.pathname.match(PAGE);
      const html = (origin.headers.get("content-type") || "").includes("text/html");
      if (!m || !html || req.method !== "GET") return origin;
      const meta = await describe(env, m[1] ? m[1].toLowerCase() : "@", m[2] || m[3]).catch(() => null);
      if (!meta) return origin;
      const page = injectMeta(await origin.text(), { ...meta, url: `${env.SITE}${url.pathname}` }, env.SITE);
      const headers = new Headers(origin.headers);
      headers.delete("content-length");
      headers.set("cache-control", "public, max-age=0, s-maxage=300");
      return new Response(page, { status: origin.status, headers });
    } catch {
      return fetch(req);
    }
  },
};

// Edge-cache generated responses for a few minutes.
async function cached(req, ctx, make) {
  const cache = caches.default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await make();
  if (res.ok) ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

// Firestore REST, signed out.

const dbUrl = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;
const docUrl = (env, path) => `${dbUrl(env)}/${path}`;

async function getDoc(env, path) {
  const res = await fetch(docUrl(env, path), { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) return null;
  return plain({ mapValue: { fields: (await res.json()).fields || {} } });
}

/** Firestore's typed JSON to plain values. */
export function plain(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  return null;
}

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// Inline photos ("mesh-media:<id>") are served as real image URLs for previews.
const imageFor = (env, url) => {
  if (!url) return `${env.SITE}${FALLBACK_IMAGE}`;
  const inline = String(url).match(/^mesh-media:([A-Za-z0-9_-]+)$/);
  if (inline) return `${env.SITE}/og/media/${inline[1]}`;
  return /^https:\/\//.test(url) ? url : `${env.SITE}${FALLBACK_IMAGE}`;
};

/** Title, description and image for a shareable page, or null when it isn't public. */
export async function describe(env, kind, id) {
  // Roll invites: the same card for every roll, so a link never reveals its
  // name or who's in it, and kept out of search.
  if (kind === "rolls") {
    return {
      title: "You're invited to a roll",
      description: "A shared disposable camera on Mesh. Everyone gets 27 shots, nobody sees a thing, and it all develops at 9am.",
      image: `${env.SITE}${FALLBACK_IMAGE}`,
      type: "website",
      noindex: true,
    };
  }
  if (kind === "news") {
    const s = await getDoc(env, `news/${encodeURIComponent(id)}`);
    if (!s || s.status !== "approved") return null;
    const byline = (s.authorNames || [s.authorName]).filter(Boolean).map((n) => `@${n}`).join(", ");
    const body = (s.blockTexts || String(s.script || "").split(/\n{2,}/)).filter(Boolean);
    return {
      title: clip(s.title, 110),
      description: clip(s.standfirst || body[0], 200),
      image: imageFor(env, s.coverUrl),
      type: "article",
      byline,
      article: {
        headline: clip(s.title, 110),
        datePublished: s.publishedAt || s.createdAt,
        dateModified: s.updateNoteAt || s.publishedAt || s.createdAt,
        authors: (s.authorNames || [s.authorName]).filter(Boolean),
        body,
        label: s.label || "report",
      },
    };
  }
  if (kind === "p") {
    const p = await getDoc(env, `posts/${encodeURIComponent(id)}`);
    if (!p || p.visibility !== "public") return null;
    const what = p.kind === "text" ? "Strand" : p.kind === "post" ? "Still" : "Flick";
    return {
      title: clip(p.title || `${what} by @${p.authorName}`, 110),
      description: clip(p.text || `A ${what} on Mesh.`, 200),
      image: imageFor(env, p.posterUrl || (p.kind === "post" ? p.mediaUrl : "")),
      type: "article",
    };
  }
  if (kind === "@" || kind === "u") {
    let uid = id;
    if (kind === "@") uid = (await getDoc(env, `usernames/${id.toLowerCase()}`))?.uid;
    const u = uid && await getDoc(env, `users/${encodeURIComponent(uid)}`);
    if (!u?.username) return null;
    return {
      title: clip(`${u.name || u.username} (@${u.username})`, 110),
      description: clip(u.bio || `@${u.username} is on Mesh, social media for humans.`, 200),
      image: imageFor(env, u.photoURL),
      type: "profile",
      card: "summary",
    };
  }
  if (kind === "gatherings") {
    const g = await getDoc(env, `events/${encodeURIComponent(id)}`);
    if (!g || g.privacy !== "public") return null;
    const when = g.startsAt ? new Date(g.startsAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }) : "";
    return {
      title: clip(g.title, 110),
      description: clip([when, g.description].filter(Boolean).join(" · "), 200),
      image: imageFor(env, g.coverUrl || g.photoUrl),
      type: "website",
      event: g.startsAt ? {
        name: clip(g.title, 150),
        startsAt: g.startsAt,
        when,
        location: clip(g.location, 300),
        description: clip(g.description, 2000),
        host: g.hostName || "",
        ticketUrl: /^https:\/\//.test(g.ticketUrl || "") ? g.ticketUrl : "",
      } : null,
    };
  }
  if (kind === "circles") {
    const c = await getDoc(env, `groups/${encodeURIComponent(id)}`);
    if (!c || !["public", "private"].includes(c.privacy)) return null;
    return {
      title: clip(`${c.name} · a circle on Mesh`, 110),
      description: clip(c.description || `${c.memberCount || 0} members.`, 200),
      image: imageFor(env, c.coverUrl || c.photoUrl),
      type: "website",
    };
  }
  return null;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Swaps the page's generic head tags for this page's, and adds article text for crawlers without JavaScript. */
export function injectMeta(html, meta, site) {
  const strip = [
    /<title>[\s\S]*?<\/title>/i,
    /<meta[^>]+name="description"[^>]*>/gi,
    /<meta[^>]+property="og:[^"]+"[^>]*>/gi,
    /<meta[^>]+name="twitter:[^"]+"[^>]*>/gi,
    /<link[^>]+rel="canonical"[^>]*>/gi,
  ];
  let out = html;
  for (const re of strip) out = out.replace(re, "");
  const tags = [
    `<title>${esc(meta.title)} · Mesh</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(meta.url)}">`,
    `<meta property="og:site_name" content="Mesh">`,
    `<meta property="og:type" content="${esc(meta.type || "website")}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(meta.url)}">`,
    `<meta property="og:image" content="${esc(meta.image)}">`,
    `<meta name="twitter:card" content="${meta.card || "summary_large_image"}">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(meta.image)}">`,
  ];
  if (meta.noindex) tags.push('<meta name="robots" content="noindex">');
  if (meta.article) {
    const a = meta.article;
    const ld = {
      "@context": "https://schema.org",
      "@type": a.label === "opinion" ? "OpinionNewsArticle" : a.label === "analysis" ? "AnalysisNewsArticle" : "NewsArticle",
      headline: a.headline,
      datePublished: a.datePublished,
      dateModified: a.dateModified,
      image: [meta.image],
      author: a.authors.map((n) => ({ "@type": "Person", name: `@${n}`, url: `${site}/@${n}` })),
      publisher: { "@type": "Organization", name: "Mesh", url: site, logo: { "@type": "ImageObject", url: `${site}/og-image.png` } },
      mainEntityOfPage: meta.url,
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  }
  if (meta.event) tags.push(`<script type="application/ld+json">${JSON.stringify(eventLd(meta, site)).replace(/</g, "\\u003c")}</script>`);
  out = out.replace(/<head([^>]*)>/i, `<head$1>\n${tags.join("\n")}`);
  if (meta.event) {
    const e = meta.event;
    const text = `<noscript><article><h1>${esc(e.name)}</h1><p>${esc(e.when)}${e.location ? ` · ${esc(e.location)}` : ""}</p>`
      + `${e.host ? `<p>Hosted by @${esc(e.host)}</p>` : ""}${e.description ? `<p>${esc(e.description)}</p>` : ""}</article></noscript>`;
    out = out.replace(/<\/body>/i, `${text}</body>`);
  }
  if (meta.article) {
    const text = `<noscript><article><h1>${esc(meta.article.headline)}</h1><p>${esc(meta.description)}</p>`
      + `<p>By ${esc(meta.byline)}</p>${meta.article.body.map((p) => `<p>${esc(p)}</p>`).join("")}</article></noscript>`;
    out = out.replace(/<\/body>/i, `${text}</body>`);
  }
  return out;
}

const ONLINE = /^(https?:\/\/|online\b|zoom\b|discord\b|google meet\b)/i;

/** schema.org Event for a public gathering, so search engines can list it as an event. */
export function eventLd(meta, site) {
  const e = meta.event;
  const start = new Date(e.startsAt);
  const online = ONLINE.test(e.location || "");
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    startDate: start.toISOString(),
    // Gatherings have no end time; Mesh's calendar files assume two hours.
    endDate: new Date(start.getTime() + 2 * 3600000).toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    description: e.description || meta.description,
    image: [meta.image],
    url: meta.url,
  };
  if (online) ld.location = { "@type": "VirtualLocation", url: /^https?:\/\//i.test(e.location) ? e.location : meta.url };
  else if (e.location) ld.location = { "@type": "Place", name: e.location, address: e.location };
  if (e.host) ld.organizer = { "@type": "Person", name: `@${e.host}`, url: `${site}/@${e.host}` };
  if (e.ticketUrl) ld.offers = { "@type": "Offer", url: e.ticketUrl };
  return ld;
}

// Public gatherings outside circles from the last 60 days onwards, for search engines.
async function gatheringsSitemap(env) {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const res = await fetch(`${dbUrl(env)}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "events" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "privacy" }, op: "EQUAL", value: { stringValue: "public" } } },
              { fieldFilter: { field: { fieldPath: "groupId" }, op: "EQUAL", value: { stringValue: "" } } },
              { fieldFilter: { field: { fieldPath: "startsAt" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: since } } },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: "startsAt" }, direction: "ASCENDING" }],
        limit: 1000,
      },
    }),
  });
  const rows = res.ok ? await res.json() : [];
  const urls = [`<url><loc>${env.SITE}/whats-on</loc><changefreq>daily</changefreq></url>`];
  for (const r of rows) {
    if (!r.document) continue;
    const id = r.document.name.split("/").pop();
    urls.push(`<url><loc>${env.SITE}/gatherings/${esc(id)}</loc><lastmod>${esc(r.document.updateTime)}</lastmod></url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}

// Published stories, newest first, for search engines.
async function sitemap(env) {
  const res = await fetch(`${dbUrl(env)}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "news" }],
        where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "approved" } } },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 1000,
      },
    }),
  });
  const rows = res.ok ? await res.json() : [];
  const urls = rows.filter((r) => r.document).map((r) => {
    const id = r.document.name.split("/").pop();
    const f = plain({ mapValue: { fields: r.document.fields } });
    const mod = f.updateNoteAt || f.publishedAt || f.createdAt || r.document.updateTime;
    return `<url><loc>${env.SITE}/news/${esc(id)}</loc>${mod ? `<lastmod>${esc(mod)}</lastmod>` : ""}</url>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}

// An inline photo (stored as a data URL in media/{id}) as an image response.
async function inlineImage(env, id) {
  const m = await getDoc(env, `media/${id}`);
  const parsed = String(m?.data || "").match(/^data:(image\/(?:webp|jpeg|png));base64,(.+)$/);
  if (!parsed) return new Response("Not found", { status: 404 });
  const bytes = Uint8Array.from(atob(parsed[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "content-type": parsed[1], "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}
