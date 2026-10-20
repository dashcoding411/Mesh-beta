import { describe, expect, it } from "vitest";
import { blocksFromDoc, blocksToDoc, mergeStory, reviewProblems, storyStats } from "../storyDoc";

const blk = (id, text, type = "p") => ({ id, type, text, media: "", alt: "" });
const story = (blocks, extra = {}) => ({ title: "Headline", standfirst: "", sources: [], keyPoints: [], blocks, ...extra });

describe("stored form", () => {
  it("round-trips through the parallel lists the rules check", () => {
    const blocks = [blk("a", "One [1]."), blk("b", "Two", "h2"), { id: "c", type: "image", text: "Caption", media: "mesh-media:x1", alt: "A dog" }, blk("d", "", "divider")];
    const doc = blocksToDoc(blocks);
    expect(doc.script).toBe("One [1].\n\nTwo\n\nCaption\n\n");
    expect(doc.blockMedia).toEqual(["", "", "mesh-media:x1", ""]);
    expect(blocksFromDoc(doc)).toEqual(blocks);
  });
  it("turns an older plain script into paragraphs", () => {
    expect(blocksFromDoc({ script: "First.\n\nSecond." }).map((b) => b.text)).toEqual(["First.", "Second."]);
  });
});

describe("merging two people's saves", () => {
  const base = story([blk("a", "A"), blk("b", "B"), blk("c", "C")]);
  it("keeps both people's edits to different blocks", () => {
    const theirs = story([blk("a", "A (them)"), blk("b", "B"), blk("c", "C")]);
    const mine = story([blk("a", "A"), blk("b", "B"), blk("c", "C (me)")]);
    expect(mergeStory(base, theirs, mine).blocks.map((b) => b.text)).toEqual(["A (them)", "B", "C (me)"]);
  });
  it("puts a block I added after the one before it, even if they added blocks too", () => {
    const theirs = story([blk("x", "X"), blk("a", "A"), blk("b", "B"), blk("c", "C")]);
    const mine = story([blk("a", "A"), blk("b", "B"), blk("n", "New"), blk("c", "C")]);
    expect(mergeStory(base, theirs, mine).blocks.map((b) => b.id)).toEqual(["x", "a", "b", "n", "c"]);
  });
  it("a block I deleted stays deleted, unless they edited it meanwhile", () => {
    const mine = story([blk("a", "A"), blk("c", "C")]);
    expect(mergeStory(base, base, mine).blocks.map((b) => b.id)).toEqual(["a", "c"]);
    const theirs = story([blk("a", "A"), blk("b", "B edited"), blk("c", "C")]);
    expect(mergeStory(base, theirs, mine).blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
  it("fields go to whoever changed them", () => {
    const theirs = { ...base, standfirst: "Their standfirst" };
    const mine = { ...base, title: "My better headline" };
    const merged = mergeStory(base, theirs, mine);
    expect(merged.title).toBe("My better headline");
    expect(merged.standfirst).toBe("Their standfirst");
  });
});

describe("ready for review", () => {
  it("counts words and citations", () => {
    const s = storyStats(story([blk("a", "Prices rose [1] and fell [2]."), blk("b", "More [1].")]));
    expect(s.cited).toEqual([1, 2]);
    expect(s.words).toBeGreaterThan(5);
  });
  it("says what's missing", () => {
    const s = story([blk("a", "Too short [3].")], { title: "Short", sources: ["https://a.example"] });
    const problems = reviewProblems(s);
    expect(problems.join(" ")).toMatch(/headline/);
    expect(problems.join(" ")).toMatch(/two sources/);
    expect(problems.join(" ")).toMatch(/cite \[3\]/);
  });
  it("passes a complete story", () => {
    const text = "A long enough paragraph about the council's new budget, which rose by four per cent this year [1], according to its own papers [2].";
    const keyPoints = ["The council's budget rose four per cent.", "Rates go up to pay for it.", "Councillors vote on it next month."];
    expect(reviewProblems(story([blk("a", text)], { title: "Council budget rises four per cent", sources: ["https://a.example/1", "https://b.example/2"], keyPoints }))).toEqual([]);
  });
  it("needs the 60-second version, three full points", () => {
    const text = "A long enough paragraph about the council's new budget, which rose by four per cent this year [1], according to its own papers [2].";
    const base = { title: "Council budget rises four per cent", sources: ["https://a.example/1", "https://b.example/2"] };
    expect(reviewProblems(story([blk("a", text)], base)).join(" ")).toMatch(/60-second version: all three/);
    const short = { ...base, keyPoints: ["Budget up.", "Rates go up to pay for it.", "Councillors vote on it next month."] };
    expect(reviewProblems(story([blk("a", text)], short)).join(" ")).toMatch(/full sentence/);
  });
  it("lets a video story publish with the video, brief and sources but no text", () => {
    const keyPoints = ["The council's budget rose four per cent.", "Rates go up to pay for it.", "Councillors vote on it next month."];
    const base = { title: "Council budget rises four per cent", sources: ["https://a.example/1", "https://b.example/2"], keyPoints, format: "video" };
    expect(reviewProblems(story([blk("a", "")], base)).join(" ")).toMatch(/Add the video/);
    expect(reviewProblems(story([blk("a", "")], { ...base, videoUrl: "https://media.example/v/a.mp4" }))).toEqual([]);
    expect(reviewProblems(story([blk("a", "")], { ...base, videoUrl: "https://media.example/v/a.mp4", keyPoints: [] })).join(" ")).toMatch(/60-second version/);
  });
});
