// The story editor's maths: filters match CSS, colours run white to black,
// text wraps the same way at any size, and stickers read right.
import { describe, expect, it } from "vitest";
import { STORY_FILTERS, colorAt, filterById, filterPixels, infoLabel, parseFilter, wrapLines } from "../storyCanvas";

const pixel = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

describe("filters", () => {
  it("parse CSS filter functions, degrees included", () => {
    expect(parseFilter("contrast(1.08) hue-rotate(-10deg) saturate(1.35)")).toEqual([["contrast", 1.08], ["hue-rotate", -10], ["saturate", 1.35]]);
    expect(parseFilter("")).toEqual([]);
  });
  it("leave a photo alone at neutral settings", () => {
    const px = pixel(200, 120, 40);
    filterPixels(px, "brightness(1) contrast(1) saturate(1) hue-rotate(0deg)");
    expect([...px]).toEqual([200, 120, 40, 255]);
  });
  it("make greys for Mono, like CSS grayscale", () => {
    const px = pixel(200, 120, 40);
    filterPixels(px, "grayscale(1)");
    expect(px[0]).toBe(px[1]);
    expect(px[1]).toBe(px[2]);
    expect(px[0]).toBe(Math.round((0.2126 * 200 + 0.7152 * 120 + 0.0722 * 40)));
  });
  it("clamp brightness and keep alpha", () => {
    const px = pixel(250, 10, 128);
    filterPixels(px, "brightness(2)");
    expect([...px]).toEqual([255, 20, 255, 255]);
  });
  it("all have names, and the rules know every id", () => {
    const ids = STORY_FILTERS.map((f) => f.id);
    expect(ids).toEqual(["none", "vivid", "warm", "cool", "fade", "dream", "mono", "noir"]);
    expect(filterById("nope").id).toBe("none");
  });
});

describe("colorAt", () => {
  it("runs white, rainbow, black", () => {
    expect(colorAt(0)).toBe("#ffffff");
    expect(colorAt(1)).toBe("#000000");
    expect(colorAt(0.5)).toMatch(/^hsl\(\d+ 95% 55%\)$/);
  });
});

describe("wrapLines", () => {
  // A font where every character is 10 units wide.
  const ctx = { measureText: (s) => ({ width: s.length * 10 }) };
  it("wraps words to the width and keeps new lines", () => {
    expect(wrapLines(ctx, "one two three four", 100)).toEqual(["one two", "three four"]);
    expect(wrapLines(ctx, "hi\nthere", 1000)).toEqual(["hi", "there"]);
  });
  it("never splits a long word", () => {
    expect(wrapLines(ctx, "supercalifragilistic", 50)).toEqual(["supercalifragilistic"]);
  });
  it("wraps the same at any scale", () => {
    const big = { measureText: (s) => ({ width: s.length * 30 }) };
    expect(wrapLines(big, "one two three four", 300)).toEqual(wrapLines(ctx, "one two three four", 100));
  });
});

describe("infoLabel", () => {
  const d = new Date(2027, 1, 17, 21, 5);
  it("writes the date stamp like a digicam", () => {
    expect(infoLabel("stamp", d)).toBe("17 02 '27");
  });
  it("writes the time and date the Australian way", () => {
    expect(infoLabel("time", d)).toMatch(/^9:05\spm$/);
    expect(infoLabel("date", d)).toMatch(/Wed/);
  });
});
