// Fake crowds: what accounts under a week old add counts a quarter in
// ranking, and bursts of it are found for staff.
import { describe, expect, it } from "vitest";
import { FRESH_CAP, FRESH_WEIGHT, isFreshAccount, recommendable, settled } from "../fresh";
import { copyClusters, freshBursts, signupBursts } from "../stats";
import { isVerifiedUser } from "../verified";
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
  it("is true for an unverified account of any age", () => {
    expect(isFreshAccount(joined(now - 90 * DAY), now, false)).toBe(true);
    expect(isFreshAccount(joined(now - 90 * DAY), now, true)).toBe(false);
  });
});

describe("isVerifiedUser", () => {
  it("needs a confirmed email or a phone number", () => {
    expect(isVerifiedUser({ email: "a@b.co", emailVerified: false })).toBe(false);
    expect(isVerifiedUser({ email: "a@b.co", emailVerified: true })).toBe(true);
    expect(isVerifiedUser({ phoneNumber: "+61400000000" })).toBe(true);
    expect(isVerifiedUser(null)).toBe(false);
  });
});

describe("recommendable", () => {
  it("holds back a fresh post from strangers until someone engages", () => {
    expect(recommendable({ fresh: true, likeCount: 0 })).toBe(false);
    expect(recommendable({ fresh: true, likeCount: 1 })).toBe(true);
    expect(recommendable({ fresh: true, repostCount: 1 })).toBe(true);
    expect(recommendable({ likeCount: 0 })).toBe(true);
  });
});

describe("settled", () => {
  it("counts established ones in full and fresh ones at a quarter", () => {
    expect(settled(10, 0)).toBe(10);
    expect(settled(10, 8)).toBe(2 + 8 * FRESH_WEIGHT);
    expect(settled(40, 40)).toBe(10);
  });
  it("caps what any number of fresh ones can add", () => {
    expect(settled(10000, 10000)).toBe(FRESH_CAP);
    expect(settled(10005, 10000)).toBe(5 + FRESH_CAP);
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

describe("copy and paste", () => {
  const text = "Check out this amazing offer at cheap-followers dot com today";
  it("finds the same words from several accounts, ignoring case and punctuation", () => {
    const items = [
      { authorId: "a", text, postId: "1" },
      { authorId: "b", text: text.toUpperCase() + "!!", postId: "2" },
      { authorId: "c", text: `  ${text}.`, postId: "3" },
      { authorId: "c", text, postId: "4" },
    ];
    const [c] = copyClusters(items);
    expect(c.accounts).toBe(3);
    expect(c.count).toBe(4);
  });
  it("ignores one account repeating itself, and short common replies", () => {
    expect(copyClusters([{ authorId: "a", text }, { authorId: "a", text }, { authorId: "a", text }])).toEqual([]);
    expect(copyClusters(["x", "y", "z"].map((authorId) => ({ authorId, text: "congrats!!" })))).toEqual([]);
  });
});

describe("sign-up bursts", () => {
  it("finds 15 or more sign-ups within 10 minutes, and nothing in a steady trickle", () => {
    const start = Date.UTC(2027, 1, 17, 9);
    const burst = Array.from({ length: 20 }, (_, i) => start + i * 20000);
    const trickle = Array.from({ length: 40 }, (_, i) => start + DAY + i * 30 * MIN);
    const found = signupBursts([...trickle, ...burst]);
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(20);
    expect(signupBursts(trickle)).toEqual([]);
  });
});
