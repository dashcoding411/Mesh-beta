// Feed ranking.
//
// Every post is scored in one unit, expected value per minute of viewer
// attention, so formats of very different lengths compete on the same axis.
// Scores are deliberately not normalised per format: that would equate
// finishing a 15s clip with finishing a 40min video.
//
// Short video still wins on throughput, so FORMAT_FLOORS guarantees each
// format a share of the first slots after scoring. Borderline posts aren't
// amplified beyond the author's followers and are spaced apart; reports
// reduce reach, and enough of them hold a post for review.

import { tsMillis, isHeld } from "./db";
import { assessText, hitsHiddenWords } from "./moderation";

const textOf = (p) => `${p.title || ""}\n${p.text || ""}\n${p.poll ? p.poll.options.join("\n") : ""}`;
const verdicts = new Map(); // post id + text length -> "ok" | "quoted" | "borderline" | "block"
function levelOf(post) {
  const key = `${post.id}:${(post.text || "").length}`;
  if (!verdicts.has(key)) verdicts.set(key, assessText(textOf(post)).level);
  return verdicts.get(key);
}
// "quoted" (abuse quoted to call it out) is deliberately not held back.
const borderline = (post) => levelOf(post) === "borderline";

/** Removes held posts, hidden-word matches and blocked content (the viewer's own posts are kept). */
export function screenForViewer(posts, { myUid, hiddenWords = [] } = {}) {
  return posts.filter((p) => p.authorId === myUid
    || (!isHeld(p) && !hitsHiddenWords(textOf(p), hiddenWords) && levelOf(p) !== "block"));
}

const SESSION_SEED = Math.random() * 1000;

function jitter(id) {
  let h = SESSION_SEED;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h / 997;
}

// Attention cost in minutes: the score's denominator. Uses a video's real
// duration when known and reading time for text.
const ATTENTION_MINUTES = { post: 0.25, text: 0.15, short: 0.3, video: 6 };

function attentionCost(post) {
  const base = ATTENTION_MINUTES[post.kind] ?? 0.5;
  if (post.kind === "video" && post.duration > 0) return Math.max(3, post.duration / 60);
  if (post.kind === "post" || post.kind === "text") {
      const words = (post.text || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(base, words / 220); // ~220 wpm
  }
  return base;
}

// Component scores

// Interest: past affinity with the author.
function interestValue(post, affinity) {
  const raw = affinity.get(post.authorId) || 0;
  if (raw < 0) return Math.max(raw * 0.8, -12); // negatives bite, but bounded
  return Math.min(Math.log2(1 + raw) * 2.2, 9);
}

// Social: follows, reposts by followed accounts, and comment activity.
function socialValue(post, followingSet) {
  const connected = followingSet.has(post.authorId);
  const msi = Math.log2(1 + (post.commentCount || 0)) * 1.8;
  const vouches = post.repostedBy?.length || 0;
  return (connected ? 4 : 0) + msi * (connected ? 1.5 : 1) + Math.log2(1 + vouches) * 3;
}

// Endorsement: saves and sends weigh more than likes.
function endorsementValue(post) {
  return (
    Math.log2(1 + (post.likeCount || 0)) * 0.9 +
    Math.log2(1 + (post.saveCount || 0)) * 1.8 +
    Math.log2(1 + (post.sendCount || 0)) * 2.6 +
    Math.log2(1 + (post.repostCount || 0)) * 2.2
  );
}

// Retention as delivered attention. Scales with duration so the later
// per-minute division doesn't penalise well-retained long videos.
function deliveredAttention(post) {
  const starts = post.viewCount || 0;
  const finishes = post.completeCount || 0;
  const minutes = attentionCost(post);
  // Neutral prior for posts with no data yet.
  const completion = starts < 5 ? 0.5 : Math.min(finishes / starts, 1);
  return completion * minutes * 3;
}

function freshnessValue(post) {
  const ageHours = (Date.now() - tsMillis(post.createdAt)) / 3.6e6;
  return 6 * Math.pow(0.5, ageHours / 20) + 0.3;
}

// Damps engagement by the slot a post was last served in, to counter position bias.
function positionBiasFactor(post) {
  const lastRank = post.lastServedRank;
  if (typeof lastRank !== "number" || lastRank < 0) return 1;
  return 1 / (1 + Math.log2(1 + lastRank) * 0.15);
}

// Capped boost for posts tagged with the viewer's interests.
function interestValue2(post, interests) {
  if (!interests?.length || !post.topics?.length) return 0;
  const hits = post.topics.filter((t) => interests.includes(t)).length;
  return Math.min(hits, 2) * 2.5;
}

export function scorePost(post, { followingSet, affinity, myUid, interests = [] }) {
  // Scale endorsements by cost before dividing, so a like is worth the same on any length.
  const durationWeight = Math.sqrt(attentionCost(post) / 0.3);

  const earned =
    (interestValue(post, affinity) +
      socialValue(post, followingSet) +
      endorsementValue(post) * positionBiasFactor(post) * durationWeight +
      deliveredAttention(post)) /
    attentionCost(post);

  // Freshness and jitter are added outside the per-minute term.
  let score = earned + freshnessValue(post) + interestValue2(post, interests) + jitter(post.id) * 2;

  if (post.authorId === myUid) score -= 3;

  // Borderline posts sink for non-followers; each report (up to five) costs reach.
  if (borderline(post) && post.authorId !== myUid && !followingSet?.has(post.authorId)) score -= 8;
  score -= Math.min(post.reportCount || 0, 5) * 0.8;

  return score;
}

// Feed assembly

// Minimum share of the first slots per format, when enough candidates exist.
export const FORMAT_FLOORS = { post: 0.2, text: 0.15, short: 0.2, video: 0.1 };

const FLOOR_WINDOW = 20;
const MAX_RUN_PER_KIND = 2;
const MAX_PER_AUTHOR_IN_WINDOW = 2;
const AUTHOR_WINDOW = 6;
const BORDERLINE_GAP = 8;

export function rankFeed(posts, ctx) {
  // Borderline posts are never recommended to non-followers.
  const pool = screenForViewer(posts, ctx)
    .filter((p) => !borderline(p) || p.authorId === ctx.myUid || ctx.followingSet?.has(p.authorId));
  const scored = pool
    .map((p) => ({ post: p, score: scorePost(p, ctx) }))
    .sort((a, b) => b.score - a.score);

  const queue = [...scored];
  const out = [];

  const available = countKinds(pool);
  const quota = {};
  for (const [kind, share] of Object.entries(FORMAT_FLOORS)) {
    quota[kind] = Math.min(Math.floor(FLOOR_WINDOW * share), available[kind] || 0);
  }

  const owedTotal = { ...quota };

  while (queue.length) {
    const placed = out.length;
    const inWindow = placed < FLOOR_WINDOW;

    // Meet floors progressively rather than at the end of the window, which would cluster formats.
    let behind = [];
    if (inWindow) {
      const elapsed = (placed + 1) / FLOOR_WINDOW;
      behind = Object.keys(quota).filter((kind) => {
        const target = Math.ceil(owedTotal[kind] * elapsed);
        const done = owedTotal[kind] - quota[kind];
        return quota[kind] > 0 && done < target;
      });
    }

    const pick = (pred) => queue.findIndex((c) => pred(c.post));
    let idx = -1;
    // Constraints relax in order: format quota, format runs, then author/borderline spacing.
    if (behind.length) idx = pick((p) => behind.includes(p.kind) && fitsDiversity(p, out));
    if (idx === -1) idx = pick((p) => fitsDiversity(p, out));
    if (idx === -1 && behind.length) idx = pick((p) => behind.includes(p.kind) && fitsSpacing(p, out));
    if (idx === -1) idx = pick((p) => fitsSpacing(p, out));
    if (idx === -1) idx = 0;

    const chosen = queue.splice(idx, 1)[0].post;
    if (quota[chosen.kind] > 0) quota[chosen.kind] -= 1;
    out.push(chosen);
  }

  // Record served position for the position-bias correction.
  return out.map((p, i) => ({ ...p, servedRank: i }));
}

function countKinds(posts) {
  return posts.reduce((acc, p) => {
    acc[p.kind] = (acc[p.kind] || 0) + 1;
    return acc;
  }, {});
}

function fitsDiversity(post, out) {
  const lastKinds = out.slice(-MAX_RUN_PER_KIND).map((p) => p.kind);
  const sameKindRun =
    lastKinds.length === MAX_RUN_PER_KIND && lastKinds.every((k) => k === post.kind);
  return !sameKindRun && fitsSpacing(post, out);
}

function fitsSpacing(post, out) {
  const recentAuthors = out.slice(-AUTHOR_WINDOW).filter((p) => p.authorId === post.authorId);
  if (recentAuthors.length >= MAX_PER_AUTHOR_IN_WINDOW) return false;

  return !borderline(post) || !out.slice(-BORDERLINE_GAP).some(borderline);
}
