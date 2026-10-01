import { tsMillis } from "./data/core.js";

/**
 * Comments as a tree of { ...comment, children }. Replies to a deleted
 * comment stay under a `{ deleted: true }` placeholder so the thread holds
 * together. Top: most liked first, then oldest. New: newest first.
 */
export function buildCommentTree(list, sort = "top") {
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
  const order = sort === "new"
    ? (a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)
    : (a, b) => (b.likeCount || 0) - (a.likeCount || 0) || tsMillis(a.createdAt) - tsMillis(b.createdAt);
  const sortAll = (nodes) => { nodes.sort(order); nodes.forEach((n) => sortAll(n.children)); };
  sortAll(roots);
  return roots;
}

/** Every reply under `nodes`, at any depth. */
export const countReplies = (nodes) => nodes.reduce((n, c) => n + 1 + countReplies(c.children), 0);
