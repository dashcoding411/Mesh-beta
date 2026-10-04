import { describe, expect, it } from "vitest";
import { editDistance, highlightParts, searchSettings } from "../settingsSearch.js";

const top = (q, opts) => searchSettings(q, opts)[0]?.id;

describe("settings search", () => {
  it("finds settings by their everyday names", () => {
    expect(top("dark mode")).toBe("theme");
    expect(top("screen time")).toBe("brick");
    expect(top("dm")).toBe("messages");
    expect(top("block")).toBe("blocked");
    expect(top("unblock someone")).toBe("blocked");
    expect(top("delete")).toBe("delete");
    expect(top("log out")).toBe("signout");
    expect(top("font size")).toBe("text");
    expect(top("export my data")).toBe("export");
    expect(top("turn off comments")).toBe("comments");
    expect(top("find friends")).toBe("contacts");
    expect(top("notifcations")).toBe("notifications");
  });

  it("forgives small typos", () => {
    expect(top("pasword")).toBe("password");
    expect(top("theem")).toBe("theme");
    expect(top("blok")).toBe("blocked");
    expect(top("parnetal controls")).toBe("family");
  });

  it("matches as you type", () => {
    expect(top("pass")).toBe("password");
    expect(top("priv")).toBe("private");
    expect(searchSettings("bri").map((r) => r.id)).toContain("brick");
  });

  it("needs every word to match, and keeps staff tools to staff", () => {
    expect(searchSettings("xyzzy")).toEqual([]);
    expect(searchSettings("dark xyzzy")).toEqual([]);
    expect(searchSettings("moderation").map((r) => r.id)).not.toContain("moderation");
    expect(top("moderation", { staff: true })).toBe("moderation");
  });

  it("measures edit distance with swaps", () => {
    expect(editDistance("theem", "theme")).toBe(1);
    expect(editDistance("block", "block")).toBe(0);
    expect(editDistance("abc", "xyzxyz")).toBeGreaterThan(2);
  });

  it("marks the matching parts for highlighting", () => {
    expect(highlightParts("Change password", "pass")).toEqual([{ text: "Change ", match: false }, { text: "pass", match: true }, { text: "word", match: false }]);
    expect(highlightParts("Theme", "")).toEqual([{ text: "Theme", match: false }]);
  });
});
