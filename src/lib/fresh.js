// Fake crowds. A farm of new accounts is the cheap way to buy approval, so
// posts, likes, saves, sends, reposts and comments from low-trust accounts
// (under a week old, or without a confirmed email or phone) are stamped
// `fresh`, and each count on a post or comment has a fresh twin (freshLikes,
// freshSaves, freshSends, freshReposts, freshComments). The rules check both.
// In ranking, fresh ones count a quarter, and never more than FRESH_CAP in
// total, so ten thousand bot likes are worth ten real ones. Links in fresh
// posts and comments aren't clickable, and a fresh post isn't recommended to
// strangers until an established account engages with it, nor is one that
// other fresh accounts posted word for word. Staff see bursts of fresh
// activity (fetchFreshActivity in lib/data/staff.js). The visible counts stay
// true.

import { tsMillis } from "./data/core.js";
import { copyClusters } from "./stats.js";

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
 * recommendations: a fresh one waits until an established account has
 * engaged with it. Fresh accounts liking each other's posts doesn't count.
 */
export function recommendable(post) {
  if (!post?.fresh) return true;
  const real = (n, f) => Math.max((n || 0) - (f || 0), 0);
  return real(post.likeCount, post.freshLikes) + real(post.commentCount, post.freshComments)
    + real(post.saveCount, post.freshSaves) + real(post.repostCount, post.freshReposts) > 0;
}

/**
 * Ids of fresh posts whose words match fresh posts from two or more other
 * accounts: a farm working from one script. Kept from strangers however
 * they've been liked (staff see them under Copies).
 */
export function crowdCopies(posts) {
  const fresh = posts.filter((p) => p.fresh).map((p) => ({ text: p.text, authorId: p.authorId, postId: p.id }));
  return new Set(copyClusters(fresh).flatMap((c) => c.postIds));
}
