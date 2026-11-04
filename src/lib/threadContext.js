// Reads a post and its comments together, with ordinary rules on the device.
// No AI, and nothing leaves the phone.
//
// The post says who it's about. Each comment is then read against the post
// (does it use what's been said about that group, does it have anything to do
// with what's in the post) and against the rest of the thread: a reply calling
// it racist, replies going along with it, the same person's other comments,
// and the same words as comments already flagged here. No single signal is
// enough, so one word never folds anything, and warmth clears the lot.
import { aboutCrime, assessText, CALLED_OUT_RE, normalize, postAbout, topicsIn } from "./moderation";
import { ABOUT_THEM, AGREES, ASKS, DOUBT, HINTS, HOSTILE, NORM, OTHERING, REBUKE, SHUT_OUT, STOP, TROPES, WARM } from "./threadWords";

const FOLD_AT = 3;
const BLOCK_AT = 5;

const stem = (w) => w.replace(/'s$/, "").replace(/(?:ing|ed|s)$/, "");
function contentWords(v) {
  const out = new Set();
  for (const w of v.match(/[a-z][a-z']+/g) || []) {
    if (STOP.has(w.replace(/'/g, ""))) continue;
    const s = stem(w);
    if (s.length > 2) out.add(s);
  }
  return out;
}
const overlaps = (a, b) => [...a].some((w) => b.has(w));
const flagged = (r) => r.level === "block" || r.level === "borderline";

/** What a comment says on its own, before the thread is looked at. */
function readOne(c, groups, postWords) {
  const v = normalize(c.text || "").trim();
  const words = contentWords(v);
  const aimed = groups.some((g) => {
    const m = TROPES[g]?.exec(v);
    return m && !overlaps(contentWords(m[0]), postWords);
  });
  return {
    c, v, words, aimed,
    warm: WARM.test(v),
    calledOut: CALLED_OUT_RE.test(v),
    rebuke: CALLED_OUT_RE.test(v) || REBUKE.test(v),
    hints: HINTS.test(v),
    doubt: DOUBT.test(v),
    aboutThem: ABOUT_THEM.test(v),
    norm: NORM.test(v) || topicsIn(c.text).length > 0,
    othering: OTHERING.test(v),
    hostile: HOSTILE.test(v),
    shutOut: SHUT_OUT.test(v),
    asks: ASKS.test(v),
    offTopic: !overlaps(words, postWords),
    level: "ok",
  };
}

function ownScore(r, named) {
  if (r.rebuke || !named) return 0;
  let score = 0;
  if (r.aimed) score += 2;
  // One "bet they..." is one piece of evidence, however many lists it's on.
  const doubting = r.hints || r.doubt;
  if (doubting) score += 1;
  if (r.norm) score += 1;
  if (r.othering) score += 1;
  else if (r.aboutThem && doubting) score += 1;
  if (r.hostile) score += 1;
  if (r.shutOut) score += 3;
  // Talking about what's actually in the post counts for a lot.
  if (score) score += r.offTopic ? 1 : -1;
  if (r.asks && !r.aimed) score -= 1;
  if (r.warm) score -= 3;
  return score;
}

/**
 * Every comment's verdict, as a Map of id to { level, category }. The word
 * filter goes first and its verdict stands; this only adds to it.
 */
export function readThread(post, comments) {
  const about = postAbout(post);
  const thread = comments.map((c) => c.text || "").join("\n");
  const byId = new Map(comments.map((c) => [c.id, c]));
  const verdicts = new Map(comments.map((c) => [c.id, assessText(c.text, {
    about, thread, parent: byId.get(c.parentId)?.text || "", comment: true,
  })]));

  // A post about a crime against a group draws angry comments on their side.
  const groups = aboutCrime(about) ? [] : [...new Set([...topicsIn(about), ...topicsIn(thread)])];
  const named = groups.length > 0;
  const postWords = contentWords(normalize(about));
  const reads = comments.map((c) => readOne(c, groups, postWords));
  const repliesTo = new Map();
  for (const r of reads) {
    if (!repliesTo.has(r.c.parentId)) repliesTo.set(r.c.parentId, []);
    repliesTo.get(r.c.parentId).push(r);
  }
  const hard = (r) => { const l = verdicts.get(r.c.id)?.level; return l === "block" || l === "borderline"; };
  for (const r of reads) if (hard(r)) r.level = verdicts.get(r.c.id).level;

  // Twice, so what's found in the first round can inform the second.
  for (let round = 0; round < 2; round++) {
    const bad = reads.filter(flagged);
    const hot = bad.length >= 2 || reads.some((r) => r.calledOut);
    for (const r of reads) {
      if (hard(r) || r.rebuke) continue;
      const parent = reads.find((x) => x.c.id === r.c.parentId);
      if (parent && flagged(parent) && AGREES.test(r.v)) { r.level = "borderline"; continue; }
      const replies = repliesTo.get(r.c.id) || [];
      const toldOff = replies.filter((x) => (named ? x.rebuke : x.calledOut)).length;
      let score = ownScore(r, named);
      if (toldOff) score += toldOff >= 2 ? 3 : named ? 2 : 3;
      if (r.warm && toldOff) score = Math.min(score, FOLD_AT - 1);
      if (named && !r.warm) {
        const others = bad.filter((b) => b !== r);
        if (score > 0 && r.c.authorId && others.some((b) => b.c.authorId === r.c.authorId)) score += 1;
        // Echoing flagged words only counts alongside something else that points the same way.
        if (score > 0 && (r.aimed || r.hints || r.othering) && others.some((b) => [...b.words].some((w) => r.words.has(w) && !postWords.has(w)))) score += 1;
        // Griping about "the bunker" in a heated thread is still griping about the bunker.
        if (hot && r.hostile && r.offTopic && (r.hints || r.othering)) score += 1;
      }
      r.level = score >= BLOCK_AT ? "block" : score >= FOLD_AT ? "borderline" : "ok";
    }
  }
  for (const r of reads) {
    if (!hard(r) && flagged(r)) verdicts.set(r.c.id, { level: r.level, category: "context" });
  }
  return verdicts;
}

/** How a comment about to be posted reads, among the ones already there. */
export function readNewComment(post, comments, text, { parent = null, authorId = "" } = {}) {
  const id = "(new)";
  const draft = { id, text, authorId, ...(parent ? { parentId: parent.id } : {}) };
  return readThread(post, [...comments, draft]).get(id);
}
