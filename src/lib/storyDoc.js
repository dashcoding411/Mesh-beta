// News story document model. Blocks are stored as parallel arrays so the
// rules can validate them; `script` (texts joined by blank lines) is also
// checked by the rules and used for search and read time. Pure functions:
// conversion, three-way merge, review checks.

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

/** Handles both block-based and legacy script-only docs. */
export function blocksFromDoc(d) {
  if (Array.isArray(d?.blockIds)) {
    return d.blockIds.map((id, i) => ({
      id, type: d.blockTypes?.[i] || "p", text: d.blockTexts?.[i] || "", media: d.blockMedia?.[i] || "", alt: d.blockAlts?.[i] || "",
    }));
  }
  return String(d?.script || "").split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => newBlock("p", p));
}

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

const FIELDS = ["title", "standfirst", "topic", "location", "coverUrl", "format", "legalHold", "legalNote", "label"];

/** What kind of piece it is, shown to readers. Commentary is fine; passing it off as reporting isn't. */
export const STORY_LABELS = [
  { id: "report", label: "Report", blurb: "What happened, from your reporting and sources" },
  { id: "analysis", label: "Analysis", blurb: "What it means, explained by the reporter" },
  { id: "explainer", label: "Explainer", blurb: "Background so readers can follow a story" },
  { id: "opinion", label: "Opinion", blurb: "Your view. Readers see it's opinion" },
];
export const labelOf = (id) => STORY_LABELS.find((l) => l.id === id) || null;
const LIST_FIELDS = ["keyPoints", "sources"];
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blockEq = (a, b) => !!a && !!b && a.type === b.type && a.text === b.text && a.media === b.media && a.alt === b.alt;

// Three-way merge. Per field and per block, a side's change wins where only
// it changed; on conflict `mine` wins for what it touched. New local blocks
// are placed after their original predecessor.
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
      // Deleted locally: drop unless changed remotely.
      if (!blockEq(t, b)) result.push(t);
      continue;
    }
    result.push(m && b && !blockEq(m, b) ? m : m && !b ? m : t);
  }
  // Locally added blocks.
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

// Sentences that name someone next to an allegation, which is where
// defamation risk sits. Attributed ones (a court, police, a charge) are
// left out. A prompt to check, not a block.
const ALLEGATION = /\b(fraud\w*|stole|steal\w*|theft|embezzl\w*|brib\w*|corrupt\w*|assault\w*|abus\w*|rape[ds]?|rapist|harass\w*|scam\w*|launder\w*|lied|liar|criminal|crook|cheat\w*|misconduct|negligen\w*|murder\w*|paedophil\w*|pedophil\w*|predator|traffick\w*|blackmail\w*|extort\w*|forg(?:ed|ery))\b/i;
const NAMED = /\b[A-Z][\p{L}'’-]+(?:\s+(?:[A-Z][\p{L}'’-]+|de|van|von|bin|al))+\b/u;
const ATTRIBUTED = /\b(allegedly|alleged|accused of|charged with|pleaded|convicted|sentenced|found guilty|court (heard|was told|found|documents?)|police (said|allege|say)|according to (court|police|the (charge|indictment|judgment)))\b/i;

export function legalRisks(story) {
  const text = [story.title, story.standfirst, ...story.blocks.map((b) => (b.type === "divider" ? "" : b.text))].join("\n");
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return sentences.filter((s) => ALLEGATION.test(s) && NAMED.test(s) && !ATTRIBUTED.test(s)).slice(0, 6);
}

/** User-facing problems blocking submission for review. */
export function reviewProblems(story) {
  const out = [];
  const body = blocksToDoc(story.blocks).script;
  if ((story.title || "").trim().length < 10) out.push("Write a headline of at least 10 characters.");
  if (body.replace(/\s/g, "").length < 100) out.push("The story needs at least a paragraph or two (100 characters).");
  const points = (story.keyPoints || []).map((k) => (k || "").trim());
  if (points.filter(Boolean).length < 3) out.push("Write the 60-second version: all three points.");
  else if (points.some((k) => k.length < 20)) out.push("Make each point of the 60-second version a full sentence (at least 20 characters).");
  const sources = (story.sources || []).filter(Boolean);
  if (sources.length < 2) out.push("List at least two sources.");
  const { cited } = storyStats(story);
  if (!cited.length) out.push("Cite your sources in the text by number, like [1] or [2].");
  const tooHigh = cited.find((n) => n < 1 || n > sources.length);
  if (tooHigh !== undefined) out.push(`You cite [${tooHigh}] but list ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
  if (story.blocks.some((b) => b.type === "image" && b.media && !b.alt.trim())) out.push("Describe every image (alt text) for people who can't see it.");
  return out;
}
