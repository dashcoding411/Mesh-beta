// Reddit-style comment threads: replies nest under what they answer, and a
// deleted comment leaves a placeholder rather than orphaning its replies.
import { describe, expect, it, vi } from "vitest";

vi.mock("../data/core.js", () => ({ tsMillis: (t) => t?.toMillis?.() ?? 0 }));

const { buildCommentTree, countReplies, bestScores, wilsonLower, likesHidden } = await import("../commentTree.js");

const at = (ms) => ({ toMillis: () => ms });
const c = (id, parentId, ms, likeCount = 0, authorId = id) => ({ id, authorId, ...(parentId ? { parentId } : {}), createdAt: at(ms), likeCount, text: id });

describe("buildCommentTree", () => {
  const list = [
    c("a", "", 1), c("b", "", 2, 5), c("a1", "a", 3), c("a2", "a", 4, 2), c("a1x", "a1", 5), c("orphan", "gone", 6),
  ];

  it("keeps flagged comments below the rest in Best and Top, whatever their likes", () => {
    const pile = [c("hate", "", 1, 10000), c("kind", "", 2, 3), c("late", "", 3, 0)];
    const sinks = (x) => x.id === "hate";
    expect(buildCommentTree(pile, "top", sinks).map((n) => n.id)).toEqual(["kind", "late", "hate"]);
    expect(buildCommentTree(pile, "best", sinks).at(-1).id).toBe("hate");
    expect(buildCommentTree(pile, "new", sinks).map((n) => n.id)).toEqual(["late", "kind", "hate"]);
  });

  it("nests replies under their parents", () => {
    const tree = buildCommentTree(list, "top");
    const a = tree.find((n) => n.id === "a");
    expect(a.children.map((n) => n.id)).toEqual(["a2", "a1"]);
    expect(a.children[1].children.map((n) => n.id)).toEqual(["a1x"]);
  });

  it("keeps replies to a deleted comment under a placeholder", () => {
    const tree = buildCommentTree(list);
    const gone = tree.find((n) => n.id === "gone");
    expect(gone.deleted).toBe(true);
    expect(gone.children.map((n) => n.id)).toEqual(["orphan"]);
  });

  it("sorts Top by likes then oldest, and New by newest", () => {
    expect(buildCommentTree(list, "top").map((n) => n.id)).toEqual(["b", "a", "gone"]);
    expect(buildCommentTree(list).map((n) => n.id)).toEqual(buildCommentTree(list, "best").map((n) => n.id));
    expect(buildCommentTree(list, "new").map((n) => n.id)).toEqual(["gone", "b", "a"]);
  });

  it("counts replies at every depth", () => {
    const a = buildCommentTree(list).find((n) => n.id === "a");
    expect(countReplies(a.children)).toBe(3);
    expect(countReplies(buildCommentTree(list))).toBe(list.length + 1);
  });

  it("doesn't change the comments it was given", () => {
    const copy = JSON.stringify(list);
    buildCommentTree(list);
    expect(JSON.stringify(list)).toBe(copy);
  });
});

describe("Best", () => {
  it("is the Wilson lower bound", () => {
    expect(wilsonLower(0, 0)).toBe(0);
    expect(wilsonLower(0, 10)).toBe(0);
    // One like alone is weaker evidence than many likes from the same share of people.
    expect(wilsonLower(1, 1)).toBeLessThan(wilsonLower(50, 50));
    expect(wilsonLower(80, 100)).toBeGreaterThan(wilsonLower(8, 10));
  });

  it("lets a well-liked late comment rise above an early one", () => {
    // "early" was posted first and 20 people joined after it; it got 4 likes.
    // "late" came after them and 6 of the 8 people since have liked it.
    const people = Array.from({ length: 20 }, (_, i) => c(`p${i}`, "", 10 + i));
    const later = Array.from({ length: 8 }, (_, i) => c(`q${i}`, "", 100 + i));
    const thread = [c("early", "", 1, 4), ...people, c("late", "", 50, 6), ...later];
    const best = buildCommentTree(thread, "best").map((n) => n.id);
    expect(best.indexOf("late")).toBeLessThan(best.indexOf("early"));
    // Top still ranks by raw likes.
    expect(buildCommentTree(thread, "top")[0].id).toBe("late");
  });

  it("doesn't count the commenter's own later replies as people who saw it", () => {
    const thread = [c("x", "", 1, 2, "ann"), c("y", "x", 2, 0, "ann"), c("z", "x", 3, 0, "ann")];
    expect(bestScores(thread).get("x")).toBe(wilsonLower(2, 2));
  });

  it("ranks a deleted comment by its best reply", () => {
    const thread = [c("a", "", 1, 0), c("r", "gone", 2, 9), c("b", "", 3, 1)];
    expect(buildCommentTree(thread, "best")[0].id).toBe("gone");
  });
});

describe("likesHidden", () => {
  it("hides like counts for a comment's first hour", () => {
    const now = 10 * 60 * 60 * 1000;
    expect(likesHidden({ createdAt: at(now - 59 * 60 * 1000) }, now)).toBe(true);
    expect(likesHidden({ createdAt: at(now - 61 * 60 * 1000) }, now)).toBe(false);
  });
});
