// The content filter: every phrase here was checked by hand once; now it's
// checked on every change. Four outcomes (block, borderline, quoted, ok), and
// innocent text that shares words with slurs has to come through as ok.
import { describe, expect, it } from "vitest";
import cases from "./moderation-cases.json";
import { assessText, checkContent, checkName, hitsHiddenWords, normalize } from "../moderation";

describe("assessText", () => {
  for (const [level, phrases] of Object.entries(cases)) {
    describe(level, () => {
      it.each(phrases)("%s", (phrase) => {
        expect(assessText(phrase).level).toBe(level);
      });
    });
  }

  it("treats every group the same way", () => {
    for (const group of ["Indians", "white people", "Muslims", "Jews", "Aboriginals", "Chinese", "immigrants", "men"]) {
      expect(assessText(`${group} are vermin`).level, group).toBe("block");
    }
  });

  it("allows criticism of ideas, countries and governments", () => {
    for (const text of ["Islam is wrong about this", "India's government made a bad call", "The CCP is corrupt", "I hate the Tories"]) {
      expect(assessText(text).level, text).toBe("ok");
    }
  });

  it("is quick enough to run on every keystroke", () => {
    const long = "Indians are wonderful people. ".repeat(160);
    const start = performance.now();
    for (let i = 0; i < 20; i++) assessText(long);
    expect((performance.now() - start) / 20).toBeLessThan(10);
  });
});

describe("normalize", () => {
  it("folds look-alike letters, accents and zero-width characters", () => {
    expect(normalize("іndіans")).toBe("indians");
    expect(normalize("café")).toBe("cafe");
    expect(normalize("a​b")).toBe("ab");
  });
});

describe("checkContent", () => {
  it("stops blocked text with a reason", () => {
    const r = checkContent("indians are dirty", { skipCooldown: true });
    expect(r.error).toMatch(/less than human/);
  });
  it("lets borderline text through with a note", () => {
    const r = checkContent("indians are stupid", { skipCooldown: true });
    expect(r.ok).toBe(true);
    expect(r.borderline).toBe(true);
    expect(r.note).toBeTruthy();
  });
  it("only lets quoted slurs through where a warning can be shown", () => {
    const text = "someone called me a paki at work today";
    expect(checkContent(text, { skipCooldown: true }).error).toBeTruthy();
    expect(checkContent(text, { skipCooldown: true, allowQuoted: true })).toMatchObject({ ok: true, quoted: true, sensitive: true });
  });
  it("doesn't filter private messages for hate speech", () => {
    expect(checkContent("wassup my nigga", { skipCooldown: true, hate: false }).ok).toBe(true);
  });
  it("still catches spam in private messages", () => {
    expect(checkContent("a".repeat(30), { skipCooldown: true, hate: false }).error).toMatch(/spam/);
  });
});

describe("checkName", () => {
  it("refuses anything flagged, since a name has no context", () => {
    expect(checkName("pajeet").error).toBeTruthy();
    expect(checkName("Mesh QA").ok).toBe(true);
  });
});

describe("hitsHiddenWords", () => {
  it("matches whole words and phrases, case-insensitively", () => {
    expect(hitsHiddenWords("No SPOILERS please", ["spoilers"])).toBe(true);
    expect(hitsHiddenWords("the season finale", ["season finale"])).toBe(true);
    expect(hitsHiddenWords("spoilersport", ["spoilers"])).toBe(false);
    expect(hitsHiddenWords("anything", [])).toBe(false);
  });
});
