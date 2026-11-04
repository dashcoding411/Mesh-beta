// The thread reader: a post and its comments read together. thread-sets.json
// holds whole threads, most of them written before the rules they test, so what's
// missed there is a measure of the rules rather than a to-do list.
import { describe, expect, it } from "vitest";
import sets from "./thread-sets.json";
import { readNewComment, readThread } from "../threadContext";

const shape = (list) => list.map((c) => ({ id: c.id, text: c.text, authorId: c.by, parentId: c.parent }));
const held = (level) => level === "block" || level === "borderline";
const levels = (post, list) => readThread(post, shape(list));
const say = (id, text, by = id, parent) => ({ id, text, by, parent });

const CAPTAIN = { text: "Australian Captain Tells Players To Put Away Champagne Bottles So Their Muslim Teammate Can Celebrate With Them" };

describe("whole threads", () => {
  const all = sets.flatMap((t) => {
    const v = levels(t.post, t.comments);
    return t.comments.map((c) => ({ ...c, level: v.get(c.id).level, on: t.post.text }));
  });

  it.each(all.filter((c) => c.want === "ok"))("leaves alone: $text", ({ level }) => {
    expect(held(level)).toBe(false);
  });

  it("catches at least what it catches today", () => {
    const hate = all.filter((c) => c.want === "flag");
    expect(hate.filter((c) => held(c.level)).length).toBeGreaterThanOrEqual(51);
    expect(hate.length).toBe(107);
  });
});

describe("the Instagram thread that started this", () => {
  const thread = [
    say("a", "This is why Australia is falling 😂😂😂😂"),
    say("b", "And In return what will that community do to them 💥💥☪️"),
    say("c", "World' best captain 🙌🙌"),
    say("d", "How do they allow cancer in their team 😢😢"),
  ];

  it("holds the hate and leaves the captain's fan alone", () => {
    const v = levels(CAPTAIN, thread);
    expect(v.get("a").level).toBe("block");
    expect(v.get("b").level).toBe("block");
    expect(v.get("d").level).toBe("block");
    expect(v.get("c").level).toBe("ok");
  });

  it("works it out from the thread when the post doesn't say", () => {
    const v = levels({ text: "Team celebrates in the sheds" }, [...thread, say("e", "why hate on him for being muslim, grow up")]);
    expect(v.get("a").level).toBe("block");
    expect(v.get("d").level).toBe("block");
    expect(v.get("e").level).toBe("ok");
  });
});

describe("reading the post", () => {
  it("does nothing on a post that isn't about anyone's identity", () => {
    const v = levels({ text: "Wallabies lose again" }, [say("a", "they are garbage, send them home"), say("b", "facts", "b", "a"), say("c", "bet they choke")]);
    expect([...v.values()].map((x) => x.level)).toEqual(["ok", "ok", "ok"]);
  });

  it("does nothing on a crime against the group", () => {
    const v = levels({ text: "Man charged after attack on Sydney mosque" }, [say("a", "they should be ashamed, this is disgusting")]);
    expect(v.get("a").level).toBe("ok");
  });

  it("the same words only count on a post about that group", () => {
    const comment = [say("a", "hope they lock the doors, watch your wallet")];
    expect(held(levels({ text: "Sudanese Australian girl picked for Queensland" }, comment).get("a").level)).toBe(true);
    expect(held(levels({ text: "New cafe opens in Paddington" }, comment).get("a").level)).toBe(false);
  });

  it("warmth clears it", () => {
    const v = levels({ text: "Muslim nurse honoured" }, [say("a", "they should give her a raise, she's a legend")]);
    expect(v.get("a").level).toBe("ok");
  });
});

describe("cross-referencing the thread", () => {
  const POST = { text: "Muslim nurse honoured after 30 years" };

  it("counts a reply telling a comment off against it", () => {
    const line = say("a", "they got here somehow");
    expect(levels(POST, [line]).get("a").level).toBe("ok");
    expect(held(levels(POST, [line, say("b", "that's racist", "b", "a")]).get("a").level)).toBe(true);
  });

  it("never holds the person calling it out", () => {
    const v = levels(POST, [say("a", "those people are terrorists"), say("b", "that's so racist, shame on you", "b", "a")]);
    expect(v.get("a").level).toBe("block");
    expect(v.get("b").level).toBe("ok");
  });

  it("holds a reply going along with a flagged comment, not with a fair one", () => {
    const v = levels(POST, [say("a", "those people are terrorists"), say("b", "facts", "b", "a"), say("c", "she looked after my dad"), say("d", "exactly", "d", "c")]);
    expect(v.get("b").level).toBe("borderline");
    expect(v.get("d").level).toBe("ok");
  });

  it("lets a flagged comment count against the same author's others", () => {
    const line = say("a", "bet they got here somehow", "x");
    const alone = levels(POST, [say("a", "they can't", "x")]).get("a").level;
    expect(alone).toBe("ok");
    expect(held(levels(POST, [line, say("b", "those people are terrorists", "x")]).get("a").level)).toBe(true);
  });

  it("doesn't let a flagged comment escalate itself", () => {
    const v = levels(POST, [say("a", "bet they lied on the form")]);
    expect(v.get("a").level).toBe("borderline");
  });
});

describe("a comment about to be posted", () => {
  it("is read among the ones already there", () => {
    const thread = shape([say("a", "why hate on him for being muslim")]);
    expect(readNewComment({ text: "The boys in the sheds" }, thread, "this is why australia is falling").level).toBe("block");
    expect(readNewComment({ text: "The boys in the sheds" }, [], "this is why australia is falling").level).toBe("ok");
  });

  it("answers a parent", () => {
    const thread = shape([say("a", "those people are terrorists")]);
    expect(readNewComment({ text: "Muslim nurse" }, thread, "facts", { parent: thread[0] }).level).toBe("borderline");
  });
});

it("is quick enough for a long thread", () => {
  const list = Array.from({ length: 300 }, (_, i) => say(`c${i}`, `comment ${i}, they looked after my dad on the ward last year`, `u${i % 40}`));
  const start = performance.now();
  readThread(CAPTAIN, shape(list));
  expect(performance.now() - start).toBeLessThan(1500);
});
