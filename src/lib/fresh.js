// Fake crowds. A farm of new accounts is the cheap way to buy approval, so
// likes, saves, sends, reposts and comments from accounts under a week old are
// stamped `fresh`, and each count on a post or comment has a fresh twin
// (freshLikes, freshSaves, freshSends, freshReposts, freshComments). The
// rules check both. Ranking gives fresh ones a quarter of the weight, and
// staff see bursts of them (fetchFreshActivity in lib/data/staff.js). The
// visible counts stay true.

import { tsMillis } from "./data/core.js";

export const FRESH_DAYS = 7;
export const FRESH_WEIGHT = 0.25;

/** Whether an account (its profile) is under a week old. */
export function isFreshAccount(profile, now = Date.now()) {
  return !!profile && tsMillis(profile.createdAt) > now - FRESH_DAYS * 86400000;
}

/** A count for ranking: established ones in full, fresh ones at a quarter. */
export function settled(total, fresh) {
  const all = Math.max(total || 0, 0);
  const f = Math.min(Math.max(fresh || 0, 0), all);
  return all - f + f * FRESH_WEIGHT;
}
