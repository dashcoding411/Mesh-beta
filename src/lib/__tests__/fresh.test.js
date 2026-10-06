// Fake crowds: what accounts under a week old add counts a quarter in
// ranking, and bursts of it are found for staff.
import { describe, expect, it } from "vitest";
import { FRESH_WEIGHT, isFreshAccount, settled } from "../fresh";
import { freshBursts } from "../stats";
import { buildCommentTree } from "../commentTree";

const DAY = 86400000;
const MIN = 60000;

describe("isFreshAccount", () => {
  const now = Date.UTC(2027, 1, 17);
  const joined = (ms) => ({ createdAt: { toMillis: () => ms } });
  it("is true for accounts under a week old", () => {
    expect(isFreshAccount(joined(now - 6 * DAY), now)).toBe(true);
    expect(isFreshAccount(joined(now - 8 * DAY), now)).toBe(false);
  });
  it("treats a missing profile or join date as established, like the rules", () => {
    expect(isFreshAccount(null, now)).toBe(false);
    expect(isFreshAccount({}, now)).toBe(false);
  });
});

describe("settled", () => {
  it("counts established ones in full and fresh ones at a quarter", () => {
    expect(settled(10, 0)).toBe(10);
    expect(settled(10, 8)).toBe(2 + 8 * FRESH_WEIGHT);
    expect(settled(40, 40)).toBe(10);
  });
  it("never trusts a twin larger than the count, or negative numbers", () => {
    expect(settled(3, 9)).toBe(3 * FRESH_WEIGHT);
    expect(settled(-2, -1)).toBe(0);
    expect(settled(undefined, undefined)).toBe(0);
  });
});

describe("comment order", () => {
  it("doesn't let new accounts' likes lift a comment over real ones", () => {
    const list = [
      { id: "farmed", likeCount: 12, freshLikes: 12, createdAt: 1 },
      { id: "real", likeCount: 5, createdAt: 2 },
    ];
    expect(buildCommentTree(list, "top").map((c) => c.id)).toEqual(["real", "farmed"]);
  });
});

describe("freshBursts", () => {
  const at = Date.UTC(2027, 1, 18, 2);
  const burst = (postId, n, spacing, kind = "like") => Array.from({ length: n }, (_, i) => ({ postId, kind, at: at + i * spacing }));

  it("flags a post with 8 in an hour, with its kinds and window", () => {
    const records = [...burst("p1", 6, MIN), ...burst("p1", 3, MIN, "comment")];
    const [b] = freshBursts(records);
    expect(b).toMatchObject({ postId: "p1", count: 9, kinds: { like: 6, comment: 3 } });
    expect(b.to - b.from).toBeLessThanOrEqual(60 * MIN);
  });
  it("ignores the same number spread over a day", () => {
    expect(freshBursts(burst("p2", 12, 2 * 3600000))).toEqual([]);
  });
  it("sorts the busiest first", () => {
    const out = freshBursts([...burst("small", 8, MIN), ...burst("big", 30, MIN / 2)]);
    expect(out.map((b) => b.postId)).toEqual(["big", "small"]);
  });
});
