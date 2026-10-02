import { afterEach, describe, expect, it, vi } from "vitest";
import { afterAuthPath, authPath, matchOverlay, matchPage, resolve, safeNext } from "../router";

describe("matchPage", () => {
  it.each([
    ["/", { tab: "home", section: "foryou" }],
    ["/flicks/abc", { tab: "home", section: "flicks", id: "abc" }],
    ["/news/story1", { tab: "home", section: "news", id: "story1" }],
    ["/circles/c1", { tab: "home", section: "circles", id: "c1" }],
    ["/gatherings/e1", { tab: "home", section: "circles", gatheringId: "e1" }],
    ["/messages/chat1", { tab: "messages", id: "chat1" }],
    ["/account/settings", { tab: "account", view: "settings" }],
    ["/account/moderation", { tab: "account", view: "moderation" }],
    ["/legal/terms", { tab: "account", view: "legal", doc: "terms" }],
    ["/login", { tab: "auth", mode: "login" }],
    ["/signup", { tab: "auth", mode: "signup" }],
  ])("%s", (path, expected) => {
    expect(matchPage(path)).toMatchObject(expected);
  });

  it("flags addresses that match nothing", () => {
    expect(matchPage("/no/such/page").notFound).toBe(true);
  });
});

describe("overlays", () => {
  it("opens profiles, posts and videos over the page underneath", () => {
    expect(matchOverlay("/u/uid1")).toEqual({ overlay: "user", id: "uid1" });
    expect(matchOverlay("/@Clementine")).toEqual({ overlay: "user", handle: "clementine" });
    expect(matchOverlay("/@ab")).toBeNull();
    expect(matchOverlay("/@not.a-handle")).toBeNull();
    expect(matchOverlay("/p/post1")).toEqual({ overlay: "post", id: "post1" });
    const r = resolve({ path: "/p/post1", bg: "/search?q=cats" });
    expect(r.overlay).toEqual({ overlay: "post", id: "post1" });
    expect(r.page).toMatchObject({ section: "search" });
    expect(r.bgQuery.get("q")).toBe("cats");
  });
});

describe("auth redirects", () => {
  const at = (url) => {
    const u = new URL(url, "https://mesh.test");
    vi.stubGlobal("window", { location: { origin: u.origin, pathname: u.pathname, search: u.search } });
  };
  afterEach(() => vi.unstubAllGlobals());

  it("returns to the page the visitor was on", () => {
    at("/circles/c1?view=about");
    expect(authPath("login")).toBe("/login?next=%2Fcircles%2Fc1%3Fview%3Dabout");
    at("/");
    expect(authPath("signup")).toBe("/signup");
  });

  it("keeps the destination when switching between log in and sign up", () => {
    at("/login?next=%2Fnews");
    expect(authPath("signup")).toBe("/signup?next=%2Fnews");
    expect(afterAuthPath()).toBe("/news");
  });

  it("only follows local paths", () => {
    at("/login?next=https%3A%2F%2Fevil.test");
    expect(afterAuthPath()).toBe("/");
    at("/login?next=%2F%2Fevil.test");
    expect(afterAuthPath()).toBe("/");
    // Browsers read a backslash as a slash, so this is //evil.test too.
    at("/login?next=%2F%5Cevil.test");
    expect(afterAuthPath()).toBe("/");
    at("/p/post1");
    expect(afterAuthPath()).toBe("/p/post1");
  });
});

describe("safeNext", () => {
  const origin = "https://mesh.example";
  it("keeps paths on this site", () => {
    expect(safeNext("/@noah?tab=posts#top", origin)).toBe("/@noah?tab=posts#top");
    expect(safeNext("/messages", origin)).toBe("/messages");
  });
  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/ /evil.com", "", null]) {
      expect(safeNext(bad, origin)).toBe("/");
    }
  });
});
