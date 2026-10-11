import { describe, expect, it } from "vitest";
import { cropRect, frameRatio, TALLEST, WIDEST } from "../framing.js";

describe("framing a photo post", () => {
  it("uses the chosen shape, or the first photo's own within the feed's limits", () => {
    expect(frameRatio("portrait", 4000, 3000)).toBe(1.25);
    expect(frameRatio("square", 4000, 3000)).toBe(1);
    expect(frameRatio("original", 4000, 3000)).toBeCloseTo(0.75); // a landscape photo stays landscape
    expect(frameRatio("original", 3000, 4000)).toBe(TALLEST); // taller than 4:5 is cut to 4:5, as the feed would
    expect(frameRatio("original", 4000, 1000)).toBe(WIDEST); // wider than 1.91:1 likewise
  });

  it("cuts a tall photo to the frame, keeping the part asked for", () => {
    expect(cropRect(1000, 2000, 1, 50, 50)).toEqual({ x: 0, y: 500, w: 1000, h: 1000 });
    expect(cropRect(1000, 2000, 1, 50, 0)).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
    expect(cropRect(1000, 2000, 1, 50, 100)).toEqual({ x: 0, y: 1000, w: 1000, h: 1000 });
  });

  it("cuts a wide photo from the side, and leaves a photo that already fits alone", () => {
    expect(cropRect(2000, 1000, 1, 0, 50)).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
    expect(cropRect(2000, 1000, 1, 100, 50)).toEqual({ x: 1000, y: 0, w: 1000, h: 1000 });
    expect(cropRect(1000, 1250, 1.25)).toEqual({ x: 0, y: 0, w: 1000, h: 1250 });
  });
});
