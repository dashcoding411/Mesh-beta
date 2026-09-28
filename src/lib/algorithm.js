// The Mesh ranking engine.
//
// Each of the big four optimises for one thing, and each is right about
// something different. Mesh blends all four:
//
//   TikTok:    interest graph. What holds attention beats who you know, so a
//               brand-new account can still surface.
//   Instagram: the sends economy. A save, and more so a send to a specific
//               person, costs the user something a like doesn't.
//   Facebook:  meaningful social interaction. Conversation between connected
//               people beats drive-by taps.
//   YouTube:   retention, not impressions. Long-form is judged on whether the
//               people who start it stay.
//
// Two deliberate design rulings, both of which cut against the obvious approach:
//
//   1. We do NOT normalise each format's engagement to its own percentile and
//      compare percentiles. That erases magnitude: finishing a 15-second clip
//      and finishing a 40-minute talk both land at "100% completion", so the
//      thing that makes long-form valuable disappears. Instead everything is
//      scored in one shared unit (expected value per minute of viewer
//      attention), so formats compete on a real axis.
//
//   2. Because short-form still wins on raw throughput under almost any
//      scoring, per-format floors are applied after scoring. Without them the
//      feed converges on whatever is cheapest to consume and the other formats
//      starve. The floors are the anti-cannibalisation mechanism; they are not
//      optional and they are not a tuning knob to zero out.
//
// And one rule about harm: reach is earned, not owed. Posts that read as
// mocking a group are allowed, but they sink for anyone who doesn't follow
// the author and never appear back to back, so a feed can't turn into fifty
// posts in a row making fun of the same people. Reports lower a post's
// reach; enough reports from established accounts take it out of feeds
// until a moderator looks. Every group gets the same treatment.

import { tsMillis, isHeld } from "./db";
import { assessText, hitsHiddenWords } from "./moderation";

const textOf = (p) => `${p.title || ""}\n${p.text || ""}\n${p.poll ? p.poll.options.join("\n") : ""}`;
const verdicts = new Map(); // post id + text length -> "ok" | "quoted" | "borderline" | "block"
function levelOf(post) {
  const key = `${post.id}:${(post.text || "").length}`;
  if (!verdicts.has(key)) verdicts.set(key, assessText(textOf(post)).level);
  return verdicts.get(key);
}
// Only mockery is held back. A post quoting abuse to call it out isn't:
// that would bury the people it happened to.
const borderline = (post) => levelOf(post) === "borderline";

/** Drop what this viewer shouldn't be shown at all: held posts, their hidden
    words, and anything the filter would block (older posts, or ones that went
    round the app). Your own posts always show for you. */
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

// Rough attention cost of consuming each format, in minutes. Used as the
// denominator so a 20-minute talk isn't compared to a 12-second clip as if
// they cost the viewer the same thing.
// A long Flick's cost is its real runtime when we know it: a 4-minute video
// and a 40-minute one shouldn't be priced the same. Strands are read, not
// watched, so they're priced by word count.
const ATTENTION_MINUTES = { post: 0.25, text: 0.15, short: 0.3, video: 6 };

function attentionCost(post) {
  const base = ATTENTION_MINUTES[post.kind] ?? 0.5;
  if (post.kind === "video" && post.duration > 0) return Math.max(3, post.duration / 60);
  if (post.kind === "post" || post.kind === "text") {
    // Longer text genuinely costs more to read.
    const words = (post.text || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(base, words / 220); // ~220 wpm
  }
  return base;
}

// --- component scores, all in "expected value" not percentiles -------------

// TikTok: how much this author's work has held your attention before.
function interestValue(post, affinity) {
  const raw = affinity.get(post.authorId) || 0;
  if (raw < 0) return Math.max(raw * 0.8, -12); // negatives bite, but bounded
  return Math.min(Math.log2(1 + raw) * 2.2, 9);
}

// Facebook: conversation is worth more than taps, and worth more again
// between people who are actually connected.
// A repost by someone you follow is a vouch from inside your own graph, so it
// counts nearly as much as following the author directly.
function socialValue(post, followingSet) {
  const connected = followingSet.has(post.authorId);
  const msi = Math.log2(1 + (post.commentCount || 0)) * 1.8;
  const vouches = post.repostedBy?.length || 0;
  return (connected ? 4 : 0) + msi * (connected ? 1.5 : 1) + Math.log2(1 + vouches) * 3;
}

// Instagram: saves and sends outrank likes because they cost the user more.
function endorsementValue(post) {
  return (
    Math.log2(1 + (post.likeCount || 0)) * 0.9 +
    Math.log2(1 + (post.saveCount || 0)) * 1.8 +
    Math.log2(1 + (post.sendCount || 0)) * 2.6 +
    Math.log2(1 + (post.repostCount || 0)) * 2.2
  );
}

// YouTube: retention, expressed as attention actually delivered rather than a
// bare rate. Finishing a 20-minute talk is twenty times more delivered value
// than finishing a 30-second clip, so this term scales with the format's
// duration. Because the whole score is later divided by that same duration, a
// well-retained long video ends up comparable to a well-retained short one
// instead of being crushed by the division, which is the failure mode of
// naive per-minute scoring.
function deliveredAttention(post) {
  const starts = post.viewCount || 0;
  const finishes = post.completeCount || 0;
  const minutes = attentionCost(post);
  // Unproven uploads get a neutral prior rather than a zero.
  const completion = starts < 5 ? 0.5 : Math.min(finishes / starts, 1);
  return completion * minutes * 3;
}

function freshnessValue(post) {
  const ageHours = (Date.now() - tsMillis(post.createdAt)) / 3.6e6;
  return 6 * Math.pow(0.5, ageHours / 20) + 0.3;
}

// Engagement counts are inflated by how prominently a post was shown, not just
// how good it was. Without correcting for that the ranker learns "things that
// ranked highly rank highly". Damping by the position a post was last served
// at is the cheap stand-in for a full shallow-tower bias model.
function positionBiasFactor(post) {
  const lastRank = post.lastServedRank;
  if (typeof lastRank !== "number" || lastRank < 0) return 1;
  return 1 / (1 + Math.log2(1 + lastRank) * 0.15);
}

// Interests you picked: a post tagged with one of them gets a lift. Capped,
// so interests shape the feed without turning it into a single topic.
function interestValue2(post, interests) {
  if (!interests?.length || !post.topics?.length) return 0;
  const hits = post.topics.filter((t) => interests.includes(t)).length;
  return Math.min(hits, 2) * 2.5;
}

export function scorePost(post, { followingSet, affinity, myUid, interests = [] }) {
  // Endorsements estimate how much value a post carries in total, so they are
  // scaled by how long that value takes to deliver before the division,
  // otherwise a like on a 20-minute video counts for a twentieth of a like on
  // a clip, which is not what a like means.
  const durationWeight = Math.sqrt(attentionCost(post) / 0.3);

  const earned =
    (interestValue(post, affinity) +
      socialValue(post, followingSet) +
      endorsementValue(post) * positionBiasFactor(post) * durationWeight +
      deliveredAttention(post)) /
    attentionCost(post);

  // Freshness and jitter sit outside the per-minute term: recency and
  // exploration shouldn't be divided away by a format's length.
  let score = earned + freshnessValue(post) + interestValue2(post, interests) + jitter(post.id) * 2;

  // Your own posts belong on your profile, not your For You page.
  if (post.authorId === myUid) score -= 3;

  // Not amplified: borderline posts reach their author's followers, and
  // sink for everyone else. Each report (up to five) costs some reach.
  if (borderline(post) && post.authorId !== myUid && !followingSet?.has(post.authorId)) score -= 8;
  score -= Math.min(post.reportCount || 0, 5) * 0.8;

  return score;
}

// --- feed assembly ---------------------------------------------------------

// Minimum share of the first N slots each format is guaranteed, provided
// enough candidates of that format exist.
export const FORMAT_FLOORS = { post: 0.2, text: 0.15, short: 0.2, video: 0.1 };

const FLOOR_WINDOW = 20;
const MAX_RUN_PER_KIND = 2;
const MAX_PER_AUTHOR_IN_WINDOW = 2;
const AUTHOR_WINDOW = 6;
const BORDERLINE_GAP = 8;

export function rankFeed(posts, ctx) {
  // Recommendations only: a borderline post reaches its author's followers
  // (in Following, on the profile, in search), never strangers' For you.
  const pool = screenForViewer(posts, ctx)
    .filter((p) => !borderline(p) || p.authorId === ctx.myUid || ctx.followingSet?.has(p.authorId));
  const scored = pool
    .map((p) => ({ post: p, score: scorePost(p, ctx) }))
    .sort((a, b) => b.score - a.score);

  const queue = [...scored];
  const out = [];

  // How many of each format the floors demand within the first window.
  const available = countKinds(pool);
  const quota = {};
  for (const [kind, share] of Object.entries(FORMAT_FLOORS)) {
    quota[kind] = Math.min(Math.floor(FLOOR_WINDOW * share), available[kind] || 0);
  }

  const owedTotal = { ...quota };

  while (queue.length) {
    const placed = out.length;
    const inWindow = placed < FLOOR_WINDOW;

    // Formats are paid down on pace across the window rather than all at the
    // end. Batching them into the last few slots is what produces a "vvv" run,
    // the exact clumping the diversity pass exists to avoid.
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
    // Rules give way in order: the format quota first, then the format-run
    // rule, and author and borderline spacing last of all.
    if (behind.length) idx = pick((p) => behind.includes(p.kind) && fitsDiversity(p, out));
    if (idx === -1) idx = pick((p) => fitsDiversity(p, out));
    if (idx === -1 && behind.length) idx = pick((p) => behind.includes(p.kind) && fitsSpacing(p, out));
    if (idx === -1) idx = pick((p) => fitsSpacing(p, out));
    if (idx === -1) idx = 0;

    const chosen = queue.splice(idx, 1)[0].post;
    if (quota[chosen.kind] > 0) quota[chosen.kind] -= 1;
    out.push(chosen);
  }

  // Record where each post was served so the next pass can discount the
  // engagement that position itself generated.
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

// The rules that hold even when formats can't be varied.
function fitsSpacing(post, out) {
  const recentAuthors = out.slice(-AUTHOR_WINDOW).filter((p) => p.authorId === post.authorId);
  if (recentAuthors.length >= MAX_PER_AUTHOR_IN_WINDOW) return false;

  // Never two borderline posts close together, whoever posted them.
  return !borderline(post) || !out.slice(-BORDERLINE_GAP).some(borderline);
}
