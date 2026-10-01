// The ranker's promises: formats and authors are spread out, borderline
// posts never cluster, and what a viewer shouldn't see isn't there at all.
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  tsMillis: (t) => (typeof t === "number" ? t : 0),
  isHeld: (p) => (p?.reportCount || 0) >= 3 && p?.modStatus !== "cleared",
}));
const { latestFirst, rankFeed, screenForViewer } = await import("../algorithm");

const now = Date.now();
let n = 0;
const post = (over = {}) => ({
  id: `p${n++}`, kind: "text", authorId: `a${n % 7}`, text: "hello there", likeCount: 0, commentCount: 0,
  saveCount: 0, sendCount: 0, repostCount: 0, createdAt: now - n * 60_000, ...over,
});
const ctx = { followingSet: new Set(), affinity: new Map(), myUid: "me", interests: [] };

describe("screenForViewer", () => {
  it("drops held posts, hidden words and blocked text, but never your own", () => {
    const list = [
      post({ id: "held", reportCount: 3 }),
      post({ id: "cleared", reportCount: 5, modStatus: "cleared" }),
      post({ id: "hidden", text: "big spoilers ahead" }),
      post({ id: "blocked", text: "indians are dirty" }),
      post({ id: "mine", authorId: "me", reportCount: 9 }),
      post({ id: "fine" }),
    ];
    const ids = screenForViewer(list, { myUid: "me", hiddenWords: ["spoilers"] }).map((p) => p.id);
    expect(ids).toEqual(["cleared", "mine", "fine"]);
  });
});

describe("rankFeed", () => {
  it("never shows the same author more than twice in six posts", () => {
    // One very popular author and plenty of others: popularity alone would
    // put all eight of theirs at the top.
    const list = [
      ...Array.from({ length: 8 }, () => post({ authorId: "prolific", likeCount: 900 })),
      ...Array.from({ length: 24 }, (_, i) => post({ authorId: `other${i}` })),
    ];
    const out = rankFeed(list, ctx);
    for (let i = 0; i + 6 <= out.length; i++) {
      expect(out.slice(i, i + 6).filter((p) => p.authorId === "prolific").length).toBeLessThanOrEqual(2);
    }
  });

  it("never recommends borderline posts to people who don't follow the author", () => {
    const mocking = Array.from({ length: 5 }, () => post({ authorId: "mocker", text: "indians are stupid", likeCount: 500 }));
    const normal = Array.from({ length: 20 }, () => post({ likeCount: 1 }));
    const out = rankFeed([...mocking, ...normal], ctx);
    expect(out.some((p) => p.text === "indians are stupid")).toBe(false);
    expect(out).toHaveLength(20);
  });

  it("keeps a followed author's borderline posts apart", () => {
    const mocking = Array.from({ length: 4 }, (_, i) => post({ authorId: `followed${i}`, text: "indians are stupid", likeCount: 500 }));
    const normal = Array.from({ length: 30 }, () => post({ likeCount: 1 }));
    const following = new Set(mocking.map((p) => p.authorId));
    const out = rankFeed([...mocking, ...normal], { ...ctx, followingSet: following });
    const positions = out.map((p, i) => (p.text === "indians are stupid" ? i : -1)).filter((i) => i >= 0);
    expect(positions).toHaveLength(4);
    for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(8);
  });

  it("returns every post it was given that the viewer may see", () => {
    const list = Array.from({ length: 12 }, () => post());
    expect(rankFeed(list, ctx)).toHaveLength(12);
  });
});

describe("hiding posts made with AI", () => {
  it("drops labelled posts when asked, except the viewer's own", () => {
    const list = [post({ id: "ai", aiGenerated: true }), post({ id: "mine", authorId: "me", aiGenerated: true }), post({ id: "plain" })];
    expect(screenForViewer(list, { myUid: "me", hideAi: true }).map((p) => p.id)).toEqual(["mine", "plain"]);
    expect(screenForViewer(list, { myUid: "me" }).map((p) => p.id)).toEqual(["ai", "mine", "plain"]);
  });
});

describe("latestFirst", () => {
  it("puts the newest activity first, counting a repost when it happened", () => {
    const list = [
      post({ id: "old", createdAt: now - 3 * 3600_000 }),
      post({ id: "new", createdAt: now - 60_000 }),
      post({ id: "middle", createdAt: now - 3600_000 }),
      post({ id: "reposted", createdAt: now - 5 * 3600_000, repostedBy: [{ uid: "f", at: now - 30_000 }] }),
    ];
    expect(latestFirst(list, ctx).map((p) => p.id)).toEqual(["reposted", "new", "middle", "old"]);
  });
});
