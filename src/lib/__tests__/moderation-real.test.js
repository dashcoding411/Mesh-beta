// How people actually write it: coded hate that only makes sense next to the
// post it's under, and the innocent lines that share its words. A comment is
// read against the post, so the same words can land differently on each.
import { describe, expect, it } from "vitest";
import cases from "./moderation-real.json";
import { assessText, checkContent, postAbout, repeatsItself } from "../moderation";

describe("anywhere", () => {
  for (const level of ["block", "borderline", "ok"]) {
    it.each(cases.anywhere[level])(`${level}: %s`, (text) => {
      expect(assessText(text).level).toBe(level);
    });
  }
});

describe.each(cases.onPosts)("on: $about", ({ about, ...levels }) => {
  for (const level of ["block", "borderline", "ok"]) {
    it.each(levels[level].length ? levels[level] : ["(none)"])(`${level}: %s`, (text) => {
      if (text !== "(none)") expect(assessText(text, { about }).level).toBe(level);
    });
  }
});

describe("subtler lines on a post", () => {
  it.each(cases.flagged)("flagged: $text", ({ text, about }) => {
    expect(assessText(text, { about, comment: true }).level).not.toBe("ok");
  });
  it.each(cases.leftAlone)("left alone: $text", ({ text, about }) => {
    expect(assessText(text, { about, comment: true }).level).toBe("ok");
  });
});

describe("preaching in comments", () => {
  for (const level of ["block", "ok"]) {
    it.each(cases.preaching[level])(`${level}: $text`, ({ text, about }) => {
      expect(assessText(text, { about, comment: true }).level).toBe(level);
    });
  }

  it("only applies to comments: your own post can say what it likes", () => {
    for (const { text, about } of cases.preaching.block) expect(assessText(text, { about }).level).toBe("ok");
    expect(checkContent(cases.preaching.block[0].text, { key: "post", skipCooldown: true }).ok).toBe(true);
    expect(checkContent(cases.preaching.block[0].text, { key: "comment", skipCooldown: true, about: "My new car" }).category).toBe("preaching");
  });

  it("answering someone's faith counts as on topic, but a sermon can't license itself", () => {
    const { text } = cases.preaching.block[0];
    expect(assessText(text, { about: "My new car", parent: "I've been praying about this", comment: true }).level).toBe("ok");
    expect(assessText(text, { about: "My new car", thread: text, comment: true }).level).toBe("block");
  });
});

describe("the same thing over and over", () => {
  const pasted = (phrase, times) => `${phrase} `.repeat(times).trim();

  it.each([
    pasted("jesus loves you", 500), pasted("JESUS LOVES YOU", 4), pasted("god loves you jesus loves you", 4),
    pasted("jesus loves you.", 10), pasted("buy my course now", 6), pasted("follow me", 8),
  ])("stops: %s", (text) => {
    expect(assessText(text.slice(0, 200), { about: "Sunday service at our church", comment: true }).category).toBe("repeated");
    expect(checkContent(text.slice(0, 200), { key: "post", skipCooldown: true }).error).toBeTruthy();
  });

  it.each([
    "jesus loves you", "jesus loves you jesus loves you", "jesus loves you jesus loves you jesus loves you",
    "no no no no no", "very very very very good", "Aussie Aussie Aussie oi oi oi", "haha haha haha haha", "love you love you love you",
    "we went round and round and round and round the block",
  ])("leaves alone: %s", (text) => {
    expect(repeatsItself(text)).toBe(false);
  });

  it("leaves private messages alone", () => {
    expect(checkContent(pasted("love you so much", 8), { key: "msg", skipCooldown: true, hate: false }).ok).toBe(true);
  });
});

describe("reading a comment against its post", () => {
  const post = { title: "", text: "Australian captain tells players to put away champagne so their Muslim teammate can celebrate", media: [{ alt: "" }], topics: [] };

  it("reads the post's words, its image descriptions and its topics", () => {
    expect(postAbout({ text: "Hi", alt: "A mosque", media: [{ alt: "Two dads" }], topics: ["Cricket"] })).toBe("Hi\nA mosque\nTwo dads\nCricket");
    expect(postAbout({})).toBe("");
  });

  it("blocks when writing, naming the rule", () => {
    const mod = checkContent("This is why Australia is falling 😂", { key: "comment", skipCooldown: true, about: postAbout(post) });
    expect(mod.category).toBe("coded");
    expect(mod.error).toMatch(/even without naming them/);
  });

  it("lets the thread name who it's about, when the post doesn't", () => {
    const silent = "This is why Australia is falling";
    expect(assessText(silent, { about: "Team celebrates in the sheds" }).level).toBe("ok");
    expect(assessText(silent, { about: "Team celebrates in the sheds", thread: "why hate on him for being muslim" }).level).toBe("block");
  });

  it("isn't cleared by someone in the thread calling out racism", () => {
    expect(assessText("This is why Australia is falling", { about: post.text, thread: "these comments are so racist" }).level).toBe("block");
  });

  it("isn't cleared by adding a word like disgusting", () => {
    expect(assessText("This is why Australia is falling, disgusting", { about: post.text }).level).toBe("block");
  });
});
