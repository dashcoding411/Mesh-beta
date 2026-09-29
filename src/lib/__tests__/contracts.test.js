// Some lists live twice: in the app, and in firestore.rules (the rules
// can't import JavaScript). If they drift apart, writes start failing for
// reasons nobody can see, so these tests read the rules file and compare.
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { INTEREST_IDS, NEWS_TOPICS } from "../interests";

const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
const listIn = (fn) => {
  const m = rules.match(new RegExp(`function ${fn}\\(\\) \\{\\s*return \\[([^\\]]*)\\]`));
  return m[1].split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
};

describe("app and security rules agree", () => {
  it("on the interest topics", () => {
    expect(listIn("interestIds")).toEqual(INTEREST_IDS);
  });

  it("on the news topics", () => {
    expect(listIn("newsTopicIds")).toEqual(NEWS_TOPICS.map((t) => t.id));
  });

  it("on the circle covers", async () => {
    const { COVER_COLORS } = await import("../data/circles.js").catch(() => ({ COVER_COLORS: null }));
    const block = rules.match(/coverColor', '[^']*'\) in \[([\s\S]*?)\]/)[1];
    const allowed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...COVER_COLORS].sort());
  });

  it("on the server's slur patterns (regenerate with scripts/rules-slur-regex.mjs)", () => {
    const [anywhere, whole] = execFileSync("node", ["scripts/rules-slur-regex.mjs"], { encoding: "utf8" }).trim().split("\n");
    expect(rules).toContain(`matches('${anywhere}')`);
    expect(rules).toContain(`matches('${whole}')`);
  });

  it("on the rate-limit stamps the app writes", () => {
    const allowed = rules.match(/match \/rateLimits\/\{uid\}[\s\S]*?keys\(\)\.hasOnly\(\[([^\]]*)\]/)[1]
      .split(",").map((k) => k.trim().replace(/'/g, ""));
    const dir = new URL("../data/", import.meta.url);
    const written = new Set();
    for (const f of readdirSync(dir)) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/"rateLimits", [^)]*\), \{ (\w+): serverTimestamp\(\)/g)) written.add(m[1]);
    }
    expect(written.size).toBeGreaterThan(0);
    for (const k of written) expect(allowed).toContain(k);
  });

  it("on what counts as contact details in a circle post", () => {
    const circles = readFileSync(new URL("../data/circles.js", import.meta.url), "utf8");
    expect(circles).toContain("(\\d[ ().-]{0,2}){9,}\\d");
    expect(rules).toContain("([0-9][ ().-]{0,2}){9,}[0-9]");
  });
});

describe("the data layer's single entry point", () => {
  it("has no two modules exporting the same name (one would be silently dropped)", () => {
    const dir = new URL("../data/", import.meta.url);
    const seen = new Map();
    const clashes = [];
    for (const f of readdirSync(dir)) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/gm)) {
        if (seen.has(m[1])) clashes.push(`${m[1]} (${seen.get(m[1])} and ${f})`);
        seen.set(m[1], f);
      }
    }
    expect(clashes).toEqual([]);
  });
});
