import { tsMillis } from "./data/core.js";

// Reddit's confidence for "Best" (80%).
const Z = 1.281551565545;

/** Lower bound of the Wilson score interval: how good `wins` out of `n` is, at worst, given the sample size. */
export function wilsonLower(wins, n, z = Z) {
  if (!n) return 0;
  const p = Math.min(1, wins / n);
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

/**
 * Scores for "Best". Mesh has likes but no downvotes, so a comment's likes
 * are weighed against the other people who have joined the conversation
 * since it was posted (a stand-in for who has seen it). An early comment
 * doesn't win just by being early, a well-liked late reply can rise, and a
 * single like isn't taken as proof.
 */
export function bestScores(list) {
  const scores = new Map();
  const after = new Set(); // authors who commented later
  const newestFirst = [...list].sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  for (const c of newestFirst) {
    const seenBy = after.size - (after.has(c.authorId) ? 1 : 0);
    const likes = c.likeCount || 0;
    scores.set(c.id, wilsonLower(likes, likes + seenBy));
    if (c.authorId) after.add(c.authorId);
  }
  return scores;
}

/**
 * Comments as a tree of { ...comment, children }. Replies to a deleted
 * comment stay under a `{ deleted: true }` placeholder so the thread holds
 * together. Best: see bestScores. Top: most liked, then oldest. New: newest.
 */
export function buildCommentTree(list, sort = "best") {
  const byId = new Map(list.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of [...byId.values()]) {
    if (!c.parentId) { roots.push(c); continue; }
    let parent = byId.get(c.parentId);
    if (!parent) {
      parent = { id: c.parentId, deleted: true, children: [], createdAt: c.createdAt, likeCount: 0 };
      byId.set(c.parentId, parent);
      roots.push(parent);
    }
    parent.children.push(c);
  }
  const oldest = (a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt);
  const likes = (a, b) => (b.likeCount || 0) - (a.likeCount || 0);
  let order;
  if (sort === "new") order = (a, b) => -oldest(a, b);
  else if (sort === "top") order = (a, b) => likes(a, b) || oldest(a, b);
  else {
    const score = bestScores(list);
    // A deleted comment ranks by its best reply.
    const of = (n) => (n.deleted ? Math.max(0, ...n.children.map(of)) : score.get(n.id) || 0);
    order = (a, b) => of(b) - of(a) || likes(a, b) || oldest(a, b);
  }
  const sortAll = (nodes) => { nodes.sort(order); nodes.forEach((n) => sortAll(n.children)); };
  sortAll(roots);
  return roots;
}

/** Every reply under `nodes`, at any depth. */
export const countReplies = (nodes) => nodes.reduce((n, c) => n + 1 + countReplies(c.children), 0);

/** Like counts stay hidden while a comment is new, so early likes don't sway later readers. */
export const LIKES_HIDDEN_MS = 60 * 60 * 1000;
export const likesHidden = (comment, now = Date.now()) => now - tsMillis(comment.createdAt) < LIKES_HIDDEN_MS;
