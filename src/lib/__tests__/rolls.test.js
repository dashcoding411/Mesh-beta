import { describe, expect, it } from "vitest";
import { centreCrop, digicamCurves, gradePixels, rng, segmentsFor, stampText } from "../digicam.js";
import { countdownLabel, developChoices, developLabel, isDeveloped, isMember, nextDevelopAt, rollIdFromLink } from "../data/rolls.js";

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe("when a roll develops", () => {
  it("is the next 9am at least four hours away", () => {
    expect(nextDevelopAt(at(10, 20))).toBe(at(11, 9)); // Saturday 8pm, Sunday 9am
    expect(nextDevelopAt(at(11, 3))).toBe(at(11, 9)); // 3am after a party, the same morning
    expect(nextDevelopAt(at(11, 6))).toBe(at(12, 9)); // 6am, the next morning
    expect(nextDevelopAt(at(11, 10))).toBe(at(12, 9));
  });

  it("offers the next morning, the two after and a week on", () => {
    const c = developChoices(at(10, 20));
    expect(c).toEqual([at(11, 9), at(12, 9), at(13, 9), at(17, 9)]);
  });

  it("says when in words", () => {
    const now = at(10, 20);
    expect(developLabel(at(11, 9), now)).toBe("tomorrow at 9am");
    expect(developLabel(at(10, 21, 30), now)).toBe("today at 9:30pm");
    expect(developLabel(at(13, 9), now)).toBe("Tuesday at 9am");
    expect(countdownLabel(at(11, 9), now)).toBe("13h 0m");
    expect(countdownLabel(now + 30000, now)).toBe("under a minute");
    expect(countdownLabel(now + 5 * 86400000, now)).toBe("5 days");
  });

  it("knows who's in it and whether it has developed", () => {
    const roll = { members: ["a", "b"], developAt: { toMillis: () => at(11, 9) } };
    expect(isMember(roll, "a")).toBe(true);
    expect(isMember(roll, "c")).toBe(false);
    expect(isDeveloped(roll, at(11, 8, 59))).toBe(false);
    expect(isDeveloped(roll, at(11, 9))).toBe(true);
  });
});

describe("the digicam look", () => {
  it("has rising tone curves with cool shadows and a deep black", () => {
    for (const flash of [true, false]) {
      const { r, g, b } = digicamCurves({ flash });
      for (let i = 1; i < 256; i++) {
        expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
        expect(g[i]).toBeGreaterThanOrEqual(g[i - 1]);
        expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
      }
      expect(b[30]).toBeGreaterThan(r[30]);
      expect(r[0]).toBeLessThan(12);
    }
    // Without flash, highlights run warmer.
    expect(digicamCurves({ flash: false }).r[220] - digicamCurves({ flash: false }).b[220])
      .toBeGreaterThan(digicamCurves({ flash: true }).r[220] - digicamCurves({ flash: true }).b[220]);
  });

  it("lights the middle with flash and falls off to the corners, with repeatable grain", () => {
    const w = 40;
    const h = 40;
    const grey = () => new Uint8ClampedArray(w * h * 4).fill(128);
    const lit = gradePixels(grey(), grey(), w, h, { flash: true, seed: 7 });
    const lum = (px, x, y) => { const i = (y * w + x) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };
    const avg = (px, x0, y0) => { let s = 0; for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) s += lum(px, x, y); return s / 16; };
    // A nudge, not a blast: the phone has already exposed the frame.
    expect(avg(lit, 18, 18)).toBeGreaterThan(avg(lit, 0, 0) + 12);
    expect(avg(lit, 18, 18)).toBeLessThan(avg(lit, 0, 0) + 35);
    expect(gradePixels(grey(), grey(), w, h, { flash: true, seed: 7 })).toEqual(lit);
    expect(gradePixels(grey(), grey(), w, h, { flash: true, seed: 8 })).not.toEqual(lit);
  });

  it("eases highlights toward white instead of clipping them", () => {
    for (const flash of [true, false]) {
      for (const ch of Object.values(digicamCurves({ flash }))) {
        // Still rising right to the top, so bright detail survives...
        for (let i = 215; i < 245; i += 5) expect(ch[i + 5]).toBeGreaterThan(ch[i]);
        // ...and nothing short of pure white is pushed all the way there.
        expect(ch[245]).toBeLessThan(255);
      }
    }
  });

  it("keeps a bright, colourful pixel's colour instead of clipping it to neon", () => {
    const w = 8;
    const h = 8;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i += 4) { px[i] = 245; px[i + 1] = 120; px[i + 2] = 30; px[i + 3] = 255; }
    const out = gradePixels(px.slice(), px.slice(), w, h, { flash: false, seed: 3 });
    const i = (4 * w + 4) * 4;
    expect(out[i]).toBeGreaterThan(out[i + 1]);
    expect(out[i + 1]).toBeGreaterThan(out[i + 2]);
    expect(out[i + 1]).toBeGreaterThan(60); // the orange stays orange, not a clipped red
  });

  it("random numbers are seedable and in range", () => {
    const a = rng(3);
    const b = rng(3);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("stamps the date day, month, year with seven-segment digits", () => {
    expect(stampText(new Date(2027, 1, 17))).toBe("17 02 '27");
    expect(segmentsFor("8")).toBe("abcdefg");
    expect(segmentsFor("1")).toBe("bc");
    expect(segmentsFor("x")).toBe("");
  });

  it("crops the middle of the frame to the shape asked for", () => {
    expect(centreCrop(1920, 1080, 3 / 4)).toEqual({ x: 555, y: 0, w: 810, h: 1080 });
    expect(centreCrop(1080, 1920, 3 / 4)).toEqual({ x: 0, y: 240, w: 1080, h: 1440 });
  });
});

describe("roll links", () => {
  it("reads a pasted invite, alone or inside a message, and nothing else", () => {
    const here = "https://joinmesh.social";
    expect(rollIdFromLink("https://joinmesh.social/rolls/Ab12Cd34Ef56Gh78Ij90", here)).toBe("Ab12Cd34Ef56Gh78Ij90");
    expect(rollIdFromLink("join my roll! https://www.joinmesh.social/rolls/Ab12Cd34Ef56Gh78Ij90?invite=1 see you", here)).toBe("Ab12Cd34Ef56Gh78Ij90");
    expect(rollIdFromLink("/rolls/Ab12Cd34Ef56Gh78Ij90", here)).toBe("Ab12Cd34Ef56Gh78Ij90");
    expect(rollIdFromLink("http://localhost:5173/rolls/Ab12Cd34Ef56Gh78Ij90", "http://localhost:5173")).toBe("Ab12Cd34Ef56Gh78Ij90");
    expect(rollIdFromLink("https://evil.example/rolls/Ab12Cd34Ef56Gh78Ij90", here)).toBeNull();
    expect(rollIdFromLink("https://joinmesh.social/p/Ab12Cd34Ef56Gh78Ij90", here)).toBeNull();
    expect(rollIdFromLink("just some words", here)).toBeNull();
    expect(rollIdFromLink("", here)).toBeNull();
  });

  it("preview the same for every roll and stay out of search", async () => {
    const { describe: describePage, injectMeta } = await import("../../../cloudflare/edge/src/worker.js");
    const env = { SITE: "https://joinmesh.social", FIREBASE_PROJECT: "x" };
    const meta = await describePage(env, "rolls", "abc");
    expect(meta.title).toBe("You're invited to a roll");
    const html = injectMeta("<html><head><title>Mesh</title></head><body></body></html>", { ...meta, url: "https://joinmesh.social/rolls/abc" }, env.SITE);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain("abc\" />");
  });
});
