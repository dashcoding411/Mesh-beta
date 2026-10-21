// Fake crowds. A farm of new accounts is the cheap way to buy approval, so
// posts, likes, saves, sends, reposts and comments from low-trust accounts
// (under a week old, or without a confirmed email or phone) are stamped
// `fresh`, and each count on a post or comment has a fresh twin (freshLikes,
// freshSaves, freshSends, freshReposts, freshComments). The rules check both.
// In ranking, fresh ones count a quarter, and never more than FRESH_CAP in
// total, so ten thousand bot likes are worth ten real ones. Links in fresh
// posts and comments aren't clickable, and a fresh post isn't recommended to
// strangers until someone engages with it. Staff see bursts of fresh activity
// (fetchFreshActivity in lib/data/staff.js). The visible counts stay true.

import { tsMillis } from "./data/core.js";

export const FRESH_DAYS = 7;
export const FRESH_WEIGHT = 0.25;
export const FRESH_CAP = 10;

/** Whether an account (its profile) is low-trust: under a week old, or not verified. */
export function isFreshAccount(profile, now = Date.now(), verified = true) {
  return !!profile && (!verified || tsMillis(profile.createdAt) > now - FRESH_DAYS * 86400000);
}

/** A count for ranking: established ones in full, fresh ones at a quarter, capped. */
export function settled(total, fresh) {
  const all = Math.max(total || 0, 0);
  const f = Math.min(Math.max(fresh || 0, 0), all);
  return all - f + Math.min(f * FRESH_WEIGHT, FRESH_CAP);
}

/**
 * Whether a viewer who doesn't follow the author should be shown a post in
 * recommendations: a fresh one waits until someone has engaged with it.
 */
export function recommendable(post) {
  if (!post?.fresh) return true;
  return (post.likeCount || 0) + (post.commentCount || 0) + (post.saveCount || 0) + (post.repostCount || 0) > 0;
}
