import { describe, expect, it } from "vitest";
import { centreCrop, digicamCurves, gradePixels, lensFringe, rng, segmentsFor, softCopy, stampText } from "../digicam.js";
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

describe("the Rolls look (compact with flash, film without)", () => {
  it("has rising tone curves with magenta-cool shadows and a lifted black", () => {
    for (const flash of [true, false]) {
      const { r, g, b } = digicamCurves({ flash });
      for (let i = 1; i < 256; i++) {
        expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
        expect(g[i]).toBeGreaterThanOrEqual(g[i - 1]);
        expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
      }
      expect(b[30]).toBeGreaterThan(r[30]);
      // Black is lifted (more without flash), not pure black...
      for (const ch of [r, g, b]) expect(ch[0]).toBeGreaterThan(flash ? 4 : 8);
      expect(Math.max(r[0], g[0], b[0])).toBeLessThan(28);
      // ...and white a creamy one, not pure white.
      for (const ch of [r, g, b]) expect(ch[255]).toBeLessThan(250);
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

  it("softens instead of sharpening, so edges never ring past where they were", () => {
    const w = 20;
    const h = 4;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i += 4) { const x = (i / 4) % w; const v = x < 10 ? 60 : 200; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
    const soft = px.slice();
    for (let i = 0; i < soft.length; i += 4) { const x = (i / 4) % w; if (x === 9 || x === 10) soft[i] = soft[i + 1] = soft[i + 2] = 130; }
    const plain = gradePixels(px.slice(), px.slice(), w, h, { flash: false, seed: 5 });
    const softened = gradePixels(px.slice(), soft, w, h, { flash: false, seed: 5 });
    const at = (a, x) => a[(2 * w + x) * 4 + 1];
    // At the edge, the softened develop sits between the two sides, closer together.
    expect(at(softened, 10) - at(softened, 9)).toBeLessThan(at(plain, 10) - at(plain, 9));
  });

  it("grains like film: the same on every channel, not coloured static", () => {
    const w = 32;
    const h = 32;
    const px = new Uint8ClampedArray(w * h * 4).fill(128);
    const out = gradePixels(px.slice(), px.slice(), w, h, { flash: false, seed: 9 });
    const diffs = [];
    const reds = [];
    for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) { const i = (y * w + x) * 4; diffs.push(out[i] - out[i + 1]); reds.push(out[i]); }
    const spread = (a) => Math.max(...a) - Math.min(...a);
    expect(spread(reds)).toBeGreaterThan(2); // there is grain
    expect(spread(diffs)).toBeLessThanOrEqual(2); // and it isn't coloured
  });

  it("turns greens toward olive and quietens them", () => {
    const w = 4;
    const h = 4;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i += 4) { px[i] = 60; px[i + 1] = 170; px[i + 2] = 60; px[i + 3] = 255; }
    const out = gradePixels(px.slice(), px.slice(), w, h, { flash: false, seed: 2 });
    const i = (1 * w + 1) * 4;
    expect(out[i] - out[i + 2]).toBeGreaterThan(8); // red rises above blue: olive
    expect(out[i + 1] - out[i]).toBeLessThan(110); // less green than it came in
  });

  it("gives flash shots more contrast than film shots", () => {
    const flash = digicamCurves({ flash: true }).g;
    const film = digicamCurves({ flash: false }).g;
    expect(flash[200] - flash[55]).toBeGreaterThan(film[200] - film[55]);
    expect(flash[0]).toBeLessThan(film[0]); // and a lower black floor
  });

  it("takes off sharpening with a very light blur", () => {
    const w = 6;
    const h = 3;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i += 4) { const x = (i / 4) % w; px[i] = px[i + 1] = px[i + 2] = x < 3 ? 0 : 200; px[i + 3] = 255; }
    const soft = softCopy(px, w, h);
    const at = (x) => soft[(1 * w + x) * 4];
    expect([at(1), at(2), at(3), at(4)]).toEqual([0, 50, 150, 200]); // only the pixels either side of the edge change
  });

  it("fringes colour toward the corners only, like an old lens", () => {
    const w = 41;
    const h = 41;
    const px = new Uint8ClampedArray(w * h * 4);
    // A white square in the middle and one near a corner, on black.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const on = (x >= 18 && x <= 22 && y >= 18 && y <= 22) || (x >= 2 && x <= 6 && y >= 2 && y <= 6);
      px[i] = px[i + 1] = px[i + 2] = on ? 255 : 0;
      px[i + 3] = 255;
    }
    const out = lensFringe(px.slice(), w, h, 1.5);
    const differs = (x, y) => { const i = (y * w + x) * 4; return out[i] !== out[i + 2]; };
    let middle = 0;
    let corner = 0;
    for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) if (differs(x, y)) middle++;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) if (differs(x, y)) corner++;
    expect(corner).toBeGreaterThan(middle);
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
