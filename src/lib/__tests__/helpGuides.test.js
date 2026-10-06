// Help: every guide is reachable, the glossary points at real guides, and
// search finds the right guide for how people actually ask.
import { describe, expect, it } from "vitest";
import { GLOSSARY, GUIDES, HELP_TOPICS, guideById, searchGuides } from "../helpGuides";
import { matchPage } from "../router";

describe("help guides", () => {
  it("each sits under a real topic, with a unique id, steps and a summary", () => {
    const topics = new Set(HELP_TOPICS.map((t) => t.id));
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIDES) {
      expect(topics.has(g.topic), g.id).toBe(true);
      expect(g.steps.length, g.id).toBeGreaterThan(0);
      expect(g.summary.length, g.id).toBeGreaterThan(10);
    }
  });
  it("every topic has guides, and every glossary word links to one", () => {
    for (const t of HELP_TOPICS) expect(GUIDES.some((g) => g.topic === t.id), t.id).toBe(true);
    for (const w of GLOSSARY) expect(guideById(w.guide), w.term).not.toBeNull();
  });
  it("never uses em dashes", () => {
    const text = JSON.stringify([GUIDES, GLOSSARY]);
    expect(text).not.toMatch(/—/);
  });
  it("routes /help and /help/<guide>", () => {
    expect(matchPage("/help")).toMatchObject({ section: "help", id: null });
    expect(matchPage("/help/rolls")).toMatchObject({ section: "help", id: "rolls" });
  });
});

describe("searchGuides", () => {
  const first = (q) => searchGuides(q)[0]?.id;
  it("finds guides the way people ask", () => {
    expect(first("turn on notifications")).toBe("notifications");
    expect(first("forgot password")).toBe("password");
    expect(first("block someone")).toBe("block-mute-report");
    expect(first("delete my account")).toBe("data-delete");
    expect(first("how do I delete my account")).toBe("data-delete");
    expect(first("how do i make a post")).toBe("post");
    expect(first("someone is bullying me")).toBe("block-mute-report");
    expect(first("where are my saved posts")).toBe("repost-save");
    expect(first("how do I call someone")).toBe("calls");
  });
  it("knows Mesh's own words", () => {
    expect(first("strand")).toBe("post");
    expect(first("echo")).toBe("stories");
    expect(first("roll")).toBe("rolls");
  });
  it("forgives typos", () => {
    expect(first("notifcations")).toBe("notifications");
  });
});
