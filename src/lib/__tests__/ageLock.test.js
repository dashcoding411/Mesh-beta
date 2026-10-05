import { describe, expect, it } from "vitest";
import { underSixteen } from "../ageLock.js";

describe("age lock", () => {
  it("knows which birth years are under 16, counting the borderline year as 16", () => {
    const now = new Date(2026, 9, 5);
    expect(underSixteen("2011", now)).toBe(true);
    expect(underSixteen("2015", now)).toBe(true);
    expect(underSixteen("2010", now)).toBe(false); // turns 16 this year: asked about the birthday instead
    expect(underSixteen("2004", now)).toBe(false);
    expect(underSixteen("2030", now)).toBe(false); // in the future: not a real year, caught elsewhere
    expect(underSixteen("201", now)).toBe(false);
  });
});
