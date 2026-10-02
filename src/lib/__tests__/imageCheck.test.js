// Where the image check draws its lines, from the classifier's scores
// (Drawing, Hentai, Neutral, Porn, Sexy). No images involved.
import { describe, expect, it } from "vitest";
import { verdictOf, uploadProblem, UnsafeImageError, UNSAFE_PHOTO } from "../imageCheck.js";

const scores = (o) => ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"].map((className) => ({ className, probability: o[className] || 0 }));

describe("verdictOf", () => {
  it("passes everyday photos", () => {
    expect(verdictOf(scores({ Neutral: 0.95, Sexy: 0.03 }))).toBe("ok");
    expect(verdictOf(scores({ Drawing: 0.9, Neutral: 0.1 }))).toBe("ok");
    // Swimwear and gym photos tend to sit here.
    expect(verdictOf(scores({ Neutral: 0.4, Sexy: 0.55 }))).toBe("ok");
    expect(verdictOf([])).toBe("ok");
  });

  it("refuses explicit images, photographic or drawn", () => {
    expect(verdictOf(scores({ Porn: 0.7, Sexy: 0.2 }))).toBe("explicit");
    expect(verdictOf(scores({ Hentai: 0.6, Drawing: 0.3 }))).toBe("explicit");
    expect(verdictOf(scores({ Porn: 0.3, Hentai: 0.25, Neutral: 0.45 }))).toBe("explicit");
  });

  it("refuses sexually suggestive images", () => {
    expect(verdictOf(scores({ Sexy: 0.85, Neutral: 0.15 }))).toBe("suggestive");
    expect(verdictOf(scores({ Sexy: 0.5, Porn: 0.4, Neutral: 0.1 }))).toBe("suggestive");
  });
});

describe("uploadProblem", () => {
  it("explains a refused image and falls back otherwise", () => {
    expect(uploadProblem(new UnsafeImageError(), "Couldn't upload")).toBe(UNSAFE_PHOTO);
    expect(uploadProblem(new Error("network"), "Couldn't upload")).toBe("Couldn't upload");
  });
});

describe("explicitScore", () => {
  it("adds the explicit classes", async () => {
    const { explicitScore } = await import("../imageCheck.js");
    expect(explicitScore(scores({ Hentai: 0.45, Porn: 0.08, Sexy: 0.31 }))).toBeCloseTo(0.53);
    expect(explicitScore([])).toBe(0);
  });
});
