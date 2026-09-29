import { describe, expect, it } from "vitest";
import { CONTACT_INFO, screenPost, circlePostVisibility, effectiveAutomod, groupNotices } from "../db";

const member = { role: "member" };
const owner = { role: "owner" };
const circle = (automod = {}, extra = {}) => ({ id: "c", privacy: "public", automod, ...extra });
const oldProfile = { createdAt: { toMillis: () => Date.now() - 400 * 86400000 }, photoURL: "x" };
const newProfile = { createdAt: { toMillis: () => Date.now() - 2 * 86400000 }, photoURL: "" };

describe("contact details (same pattern as the rules)", () => {
  it("catches phone numbers, emails and card numbers", () => {
    for (const s of ["call 0412 345 678", "+61 412 345 678", "sam.jones@example.com", "4111 1111 1111 1111", "(03) 9123 4567"]) {
      expect(CONTACT_INFO.test(s), s).toBe(true);
    }
  });
  it("leaves years, prices and times alone", () => {
    for (const s of ["the 2019-2024 season", "$1,250.00 each", "meet at 7:30pm", "rooms 12, 14 and 16", "@sam_jones"]) {
      expect(CONTACT_INFO.test(s), s).toBe(false);
    }
  });
});

describe("Admin Assist in the app (mirrors the rules)", () => {
  it("reads the older switches as the new settings", () => {
    const a = effectiveAutomod(circle({ blockLinks: true, blockNewAccounts: true }));
    expect(a.linkAction).toBe("block");
    expect(a.newAccountDays).toBe(7);
  });
  it("declines what the circle declines, with the reason", () => {
    const g = circle({ blockContactInfo: true, minLength: 10, mediaAllowed: false, linkAction: "block" });
    expect(screenPost("ring me 0412 345 678 ok", g, oldProfile, member)).toMatch(/phone numbers/);
    expect(screenPost("hi", g, oldProfile, member)).toMatch(/at least 10 characters/);
    expect(screenPost("a lovely photo of the bay", g, oldProfile, member, { kind: "post" })).toMatch(/words only/);
    expect(screenPost("see https://example.com now", g, oldProfile, member)).toMatch(/links/);
    expect(screenPost("a perfectly fine question", g, oldProfile, member)).toBeNull();
  });
  it("admins are exempt from posting limits, not from blocked words", () => {
    const g = circle({ blockContactInfo: true, bannedWords: ["crypto"] });
    expect(screenPost("ring me 0412 345 678", g, oldProfile, owner)).toBeNull();
    expect(screenPost("buy crypto", g, oldProfile, owner)).toMatch(/blocks the word/);
  });
  it("slow mode says how long to wait", () => {
    const g = circle({ slowModeMinutes: 15 });
    const recent = { ...member, lastPostAt: { toMillis: () => Date.now() - 5 * 60000 } };
    expect(screenPost("another good post", g, oldProfile, recent)).toMatch(/again in 10 minutes/);
  });
  it("review-first conditions send a post to the queue instead", () => {
    expect(circlePostVisibility(circle({ linkAction: "hold" }), member, { text: "www.example.com", profile: oldProfile })).toBe("pending");
    expect(circlePostVisibility(circle({ newAccountDays: 30, newAccountAction: "hold" }), member, { text: "hello", profile: newProfile })).toBe("pending");
    expect(circlePostVisibility(circle({ holdNoPhoto: true }), member, { text: "hello", profile: newProfile })).toBe("pending");
    expect(circlePostVisibility(circle({ holdNoPhoto: true }), member, { text: "hello", profile: oldProfile })).toBe("public");
    expect(circlePostVisibility(circle({ holdNoPhoto: true }, { privacy: "private" }), owner, { text: "hello", profile: newProfile })).toBe("circle");
  });
});

describe("notifications", () => {
  const n = (id, type, actorId, postId = "", read = false) => ({ id, type, actorId, postId, read, createdAt: { toMillis: () => 1 } });
  it("folds likes and reposts of one post together, keeps the rest apart", () => {
    const groups = groupNotices([
      n("1", "like", "a", "p1"), n("2", "like", "b", "p1", true), n("3", "comment", "c", "p1"),
      n("4", "like", "d", "p2"), n("5", "follow", "e"), n("6", "repost", "a", "p1"),
    ]);
    expect(groups.map((g) => [g.type, g.items.length])).toEqual([["like", 2], ["comment", 1], ["like", 1], ["follow", 1], ["repost", 1]]);
    expect(groups[0].unread).toBe(true);
  });
});
