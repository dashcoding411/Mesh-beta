import { describe as group, expect, it } from "vitest";
import worker, { injectMeta, plain } from "../../../cloudflare/edge/src/worker.js";

const page = '<!doctype html><html><head><meta charset="utf-8"><title>Mesh</title><meta name="description" content="generic">'
  + '<meta property="og:title" content="generic"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://joinmesh.social/"></head>'
  + '<body><div id="root"></div></body></html>';

group("edge worker", () => {
  it("turns Firestore REST values into plain ones", () => {
    expect(plain({ mapValue: { fields: { a: { stringValue: "x" }, n: { integerValue: "3" }, l: { arrayValue: { values: [{ stringValue: "y" }] } } } } }))
      .toEqual({ a: "x", n: 3, l: ["y"] });
  });

  it("replaces the generic head with the page's own, escaped", () => {
    const out = injectMeta(page, { title: 'Floods <b>"close"</b> roads', description: "Rain", image: "https://joinmesh.social/og.png", url: "https://joinmesh.social/p/1" }, "https://joinmesh.social");
    expect(out).toContain("<title>Floods &lt;b&gt;&quot;close&quot;&lt;/b&gt; roads · Mesh</title>");
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).not.toContain('content="generic"');
    expect(out).toContain('<meta property="og:image" content="https://joinmesh.social/og.png">');
    expect(out).toContain('<link rel="canonical" href="https://joinmesh.social/p/1">');
    expect(out).not.toContain("ld+json");
  });

  it("adds article data and readable text for news", () => {
    const out = injectMeta(page, {
      title: "Council votes", description: "The vote", image: "https://x/y.png", url: "https://joinmesh.social/news/a", byline: "@sam",
      article: { headline: "Council votes", datePublished: "2026-10-01T00:00:00Z", dateModified: "2026-10-01T00:00:00Z", authors: ["sam"], body: ["First </script> para"], label: "opinion" },
    }, "https://joinmesh.social");
    expect(out).toContain('"@type":"OpinionNewsArticle"');
    expect(out).not.toMatch(/<\/script> para/);
    expect(out).toMatch(/<noscript><article><h1>Council votes<\/h1>[\s\S]*<\/article><\/noscript><\/body>/);
  });
  it("keeps $& and $' in titles as plain text", () => {
    const page = "<html><head><title>Mesh</title></head><body></body></html>";
    const out = injectMeta(page, { title: "Price $& $' $1", description: "d", image: "https://joinmesh.social/og.png", url: "https://joinmesh.social/p/1" }, "https://joinmesh.social");
    expect(out).toContain("<title>Price $&amp; $&#39; $1 · Mesh</title>");
    expect(out.match(/<head>/g)).toHaveLength(1);
  });
  it("sends Mesh's own Google answer on to /login, fragment and all", async () => {
    const res = await worker.fetch(new Request("https://joinmesh.social/__/auth/handler"), {}, {});
    const html = await res.text();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain('location.replace("/login" + location.hash)');
  });
});
