import { describe, expect, it } from "vitest";
import { chapterAt, parseChapters } from "../chapters";

describe("chapters from a description", () => {
  it("reads timestamped lines in order", () => {
    const text = "Making bread at home.\n\n0:00 Intro\n2:15 - Mixing\n1:05:30 Baking\nThanks for watching";
    expect(parseChapters(text)).toEqual([
      { at: 0, title: "Intro" },
      { at: 135, title: "Mixing" },
      { at: 3930, title: "Baking" },
    ]);
  });

  it("needs two chapters, starting at 0:00", () => {
    expect(parseChapters("Skip to 3:20 for the good bit")).toEqual([]);
    expect(parseChapters("1:00 Middle\n2:00 End")).toEqual([]);
    expect(parseChapters("0:00 Only one")).toEqual([]);
  });

  it("finds the chapter playing", () => {
    const chapters = parseChapters("0:00 A\n1:00 B\n2:00 C");
    expect(chapterAt(chapters, 0)).toBe(0);
    expect(chapterAt(chapters, 90)).toBe(1);
    expect(chapterAt(chapters, 500)).toBe(2);
  });
});
