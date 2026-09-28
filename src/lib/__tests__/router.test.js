import { describe, expect, it } from "vitest";
import { matchOverlay, matchPage, resolve } from "../router";

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
    expect(matchOverlay("/p/post1")).toEqual({ overlay: "post", id: "post1" });
    const r = resolve({ path: "/p/post1", bg: "/search?q=cats" });
    expect(r.overlay).toEqual({ overlay: "post", id: "post1" });
    expect(r.page).toMatchObject({ section: "search" });
    expect(r.bgQuery.get("q")).toBe("cats");
  });
});
