// Affinity is one document of scores; old and excess entries are forgotten.
import { describe, expect, it } from "vitest";
import { sortScores } from "../data/affinity";

const DAY = 86400000;
const at = (ms) => ({ toMillis: () => ms });

describe("sortScores", () => {
  const now = Date.UTC(2027, 1, 17);
  it("keeps recent scores, most recent first, and forgets ones untouched for 90 days", () => {
    const { keep, forget } = sortScores({
      a: { s: 3, t: at(now - DAY) },
      b: { s: 1, t: at(now - 91 * DAY) },
      c: { s: -2, t: at(now - 10 * DAY) },
    }, now);
    expect(keep).toEqual([["a", 3], ["c", -2]]);
    expect(forget).toEqual(["b"]);
  });
  it("keeps only the 500 most recent", () => {
    const scores = Object.fromEntries(Array.from({ length: 502 }, (_, i) => [`u${i}`, { s: 1, t: at(now - i * 60000) }]));
    const { keep, forget } = sortScores(scores, now);
    expect(keep).toHaveLength(500);
    expect(forget).toEqual(["u500", "u501"]);
  });
  it("treats a score still being written as recent", () => {
    expect(sortScores({ a: { s: 2, t: null } }, now).keep).toEqual([["a", 2]]);
  });
});
