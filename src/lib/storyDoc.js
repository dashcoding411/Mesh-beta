// A news story as a structured document: an ordered list of blocks
// (paragraph, heading, quote, list, image, divider), not a blob of HTML.
//
// Stored as parallel lists (ids, types, texts, images, descriptions) so the
// security rules can check every word; `script` is the texts joined, which
// the rules check too, and which search, summaries and read times use.
// This file is the pure part: conversion, merging concurrent edits, and the
// checks a story has to pass before review.

export const BLOCK_TYPES = [
  { id: "p", label: "Paragraph" },
  { id: "h2", label: "Heading" },
  { id: "h3", label: "Subheading" },
  { id: "quote", label: "Quote" },
  { id: "list", label: "List" },
  { id: "image", label: "Image" },
  { id: "divider", label: "Divider" },
];
export const MAX_BLOCKS = 150;
export const CITE_RE = /\[(\d{1,2})\]/g;

let counter = 0;
export function newBlockId() {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function newBlock(type = "p", text = "") {
  return { id: newBlockId(), type, text, media: "", alt: "" };
}

/** Blocks from a stored story (new ones), or from an older plain script. */
export function blocksFromDoc(d) {
  if (Array.isArray(d?.blockIds)) {
    return d.blockIds.map((id, i) => ({
      id, type: d.blockTypes?.[i] || "p", text: d.blockTexts?.[i] || "", media: d.blockMedia?.[i] || "", alt: d.blockAlts?.[i] || "",
    }));
  }
  return String(d?.script || "").split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => newBlock("p", p));
}

/** The stored form: parallel lists, plus the joined text the rules check. */
export function blocksToDoc(blocks) {
  const list = blocks.slice(0, MAX_BLOCKS);
  const blockTexts = list.map((b) => (b.type === "divider" ? "" : String(b.text || "")));
  return {
    blockIds: list.map((b) => b.id),
    blockTypes: list.map((b) => b.type),
    blockTexts,
    blockMedia: list.map((b) => (b.type === "image" ? b.media || "" : "")),
    blockAlts: list.map((b) => (b.type === "image" ? b.alt || "" : "")),
    script: blockTexts.join("\n\n"),
  };
}

const FIELDS = ["title", "standfirst", "topic", "location", "coverUrl", "format", "legalHold", "legalNote"];
const LIST_FIELDS = ["keyPoints", "sources"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blockEq = (a, b) => !!a && !!b && a.type === b.type && a.text === b.text && a.media === b.media && a.alt === b.alt;

/* Two people saved at once: `base` is what you started from, `theirs` is
   what's on the server now, `mine` is your version. Each field and each
   block goes to whoever changed it; where both did, yours wins for fields
   and blocks you touched, theirs for the rest. Blocks you added keep their
   place after the block before them. */
export function mergeStory(base, theirs, mine) {
  const out = { ...theirs };
  for (const f of [...FIELDS, ...LIST_FIELDS]) {
    if (!same(mine[f], base[f])) out[f] = mine[f];
  }
  const baseMap = new Map(base.blocks.map((b) => [b.id, b]));
  const mineMap = new Map(mine.blocks.map((b) => [b.id, b]));
  const result = [];
  for (const t of theirs.blocks) {
    const b = baseMap.get(t.id);
    const m = mineMap.get(t.id);
    if (!m && b) {
      // You deleted it: gone, unless they changed it meanwhile.
      if (!blockEq(t, b)) result.push(t);
      continue;
    }
    result.push(m && b && !blockEq(m, b) ? m : m && !b ? m : t);
  }
  // Blocks you added that the server doesn't have yet.
  const have = new Set(result.map((b) => b.id));
  mine.blocks.forEach((m, i) => {
    if (have.has(m.id) || baseMap.has(m.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.findIndex((r) => r.id === mine.blocks[j].id);
      if (k !== -1) { at = k + 1; break; }
    }
    result.splice(at, 0, m);
    have.add(m.id);
  });
  out.blocks = result;
  return out;
}

export function storyStats(story) {
  const text = [story.title, story.standfirst, ...story.blocks.map((b) => (b.type === "divider" ? "" : b.text))].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const cites = new Set();
  for (const b of story.blocks) for (const m of String(b.text || "").matchAll(CITE_RE)) cites.add(Number(m[1]));
  return { words, minutes: Math.max(1, Math.round(words / 220)), cited: [...cites].sort((a, b) => a - b) };
}

/** Everything a story needs before a reviewer sees it, in words. */
export function reviewProblems(story) {
  const out = [];
  const body = blocksToDoc(story.blocks).script;
  if ((story.title || "").trim().length < 10) out.push("Write a headline of at least 10 characters.");
  if (body.replace(/\s/g, "").length < 100) out.push("The story needs at least a paragraph or two (100 characters).");
  const sources = (story.sources || []).filter(Boolean);
  if (sources.length < 2) out.push("List at least two sources.");
  const { cited } = storyStats(story);
  if (!cited.length) out.push("Cite your sources in the text by number, like [1] or [2].");
  const tooHigh = cited.find((n) => n < 1 || n > sources.length);
  if (tooHigh !== undefined) out.push(`You cite [${tooHigh}] but list ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
  if (story.blocks.some((b) => b.type === "image" && b.media && !b.alt.trim())) out.push("Describe every image (alt text) for people who can't see it.");
  return out;
}
