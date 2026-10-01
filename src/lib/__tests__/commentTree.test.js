// Reddit-style comment threads: replies nest under what they answer, and a
// deleted comment leaves a placeholder rather than orphaning its replies.
import { describe, expect, it, vi } from "vitest";

vi.mock("../data/core.js", () => ({ tsMillis: (t) => t?.toMillis?.() ?? 0 }));

const { buildCommentTree, countReplies } = await import("../commentTree.js");

const at = (ms) => ({ toMillis: () => ms });
const c = (id, parentId, ms, likeCount = 0) => ({ id, ...(parentId ? { parentId } : {}), createdAt: at(ms), likeCount, text: id });

describe("buildCommentTree", () => {
  const list = [
    c("a", "", 1), c("b", "", 2, 5), c("a1", "a", 3), c("a2", "a", 4, 2), c("a1x", "a1", 5), c("orphan", "gone", 6),
  ];

  it("nests replies under their parents", () => {
    const tree = buildCommentTree(list);
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
