// Follow suggestions: people from your synced contacts (only if you chose to
// sync them, see lib/contacts.js), friends-of-friends (mutual-follow overlap)
// and collaborative filtering over affinity. IPs and location are never used.
// New accounts fall back to the most followed accounts.
//
// Walking follow lists costs a read per entry, so the walk is capped (about
// 1,100 reads at most) and its result kept on this device for 6 hours; a
// visit in between only reads the profiles it shows.

import { fetchFollowList, fetchAffinity, fetchPopularProfiles, fetchProfiles, me, tsMillis } from "./db";
import { fetchContactMatches } from "./contacts";

// Working these out reads a few hundred documents, so they last a day.
const KEEP_MS = 24 * 3600_000;
const keyFor = (uid) => `mesh:suggest:${uid}`;

const REASONS = {
  contacts: "In your contacts",
  mutual: (n) => `Followed by ${n} ${n === 1 ? "person" : "people"} you follow`,
  taste: "Because of accounts you engage with",
  popular: "Popular on Mesh",
  fresh: "New to Mesh",
};

export async function suggestedAccounts(followingSet, { max = 12 } = {}) {
  const uid = me();
  const following = followingSet instanceof Set ? followingSet : new Set();
  let ranked = null;
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(uid)) || "null");
    if (saved && Date.now() - saved.at < KEEP_MS && Array.isArray(saved.list)) ranked = saved.list;
  } catch { /* storage blocked */ }
  if (!ranked) {
    ranked = await rankAccounts(uid, following, max * 2);
    try { localStorage.setItem(keyFor(uid), JSON.stringify({ at: Date.now(), list: ranked })); } catch { /* storage full or blocked */ }
  }
  const shown = ranked.filter((r) => r.id !== uid && !following.has(r.id)).slice(0, max);
  const profiles = await fetchProfiles(shown.map((r) => r.id));
  return shown.map((r) => (profiles.get(r.id) ? { ...profiles.get(r.id), reason: r.reason, score: r.score } : null)).filter(Boolean);
}

/** Who to suggest: [{ id, reason, score }], best first. */
async function rankAccounts(uid, following, max) {
  const scores = new Map(); // uid -> { score, reasons:Set }

  const add = (target, points, reason) => {
    if (!target || target === uid || following.has(target)) return;
    const cur = scores.get(target) || { score: 0, reasons: new Set() };
    cur.score += points;
    cur.reasons.add(reason);
    scores.set(target, cur);
  };

  // Your contacts, if you synced them.
  for (const target of await fetchContactMatches().catch(() => [])) add(target, 20, REASONS.contacts);

  // Friends of friends
  const mutualCounts = new Map();
  const firstHop = [...following].slice(0, 8);
  await Promise.all(
    firstHop.map(async (personIFollow) => {
      const theirFollows = await fetchFollowList(personIFollow, "following", 25).catch(() => []);
      for (const f of theirFollows) {
        mutualCounts.set(f.id, (mutualCounts.get(f.id) || 0) + 1);
      }
    })
  );
  for (const [target, count] of mutualCounts) {
    // Diminishing returns per connecting account.
    add(target, 4 * Math.log2(1 + count), REASONS.mutual(count));
  }

  // Collaborative filtering
  const affinity = await fetchAffinity().catch(() => new Map());
  const myTaste = [...affinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([authorId]) => authorId);

  await Promise.all(
    myTaste.map(async (author) => {
      const theirFollowers = await fetchFollowList(author, "followers", 4).catch(() => []);
      await Promise.all(
        theirFollowers.map(async (peer) => {
          const peerFollows = await fetchFollowList(peer.id, "following", 15).catch(() => []);
          for (const f of peerFollows) add(f.id, 1.5, REASONS.taste);
        })
      );
    })
  );

  // Cold start
  if (scores.size < max) {
    const popular = await fetchPopularProfiles(Math.min(max * 3, 50)).catch(() => []);
    for (const p of popular) {
      const age = Date.now() - tsMillis(p.createdAt);
      const isNew = age > 0 && age < 14 * 86400000;
      add(p.id, (p.followerCount || 0) * 0.05 + 0.5, isNew ? REASONS.fresh : REASONS.popular);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, max)
    .map(([id, meta]) => ({ id, reason: [...meta.reasons][0], score: Math.round(meta.score * 100) / 100 }));
}
