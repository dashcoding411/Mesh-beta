// Who to follow.
//
// Two graphs, same as the big platforms build:
//
//   Social graph:  people you plausibly already know. Mutual-follow overlap is
//                   the honest signal available to us; we deliberately do NOT
//                   touch contacts, IP addresses or location, because harvesting
//                   those to guess real-world ties is exactly the practice that
//                   makes these products feel invasive.
//   Interest graph: collaborative filtering. If the accounts you engage with
//                   are also followed by someone else, whatever else they follow
//                   is a decent bet for you.
//
// Cold start: a brand-new account has neither graph, so fall back to the most
// followed accounts on the instance.

import { db } from "../firebase";
import { collection, getDocs, query, limit, where } from "firebase/firestore";
import { fetchFollowList, fetchAffinity, me, tsMillis } from "./db";

const REASONS = {
  mutual: (n) => `Followed by ${n} ${n === 1 ? "person" : "people"} you follow`,
  taste: "Because of accounts you engage with",
  popular: "Popular on Mesh",
  fresh: "New to Mesh",
};

export async function suggestedAccounts(followingSet, { max = 12 } = {}) {
  const uid = me();
  const following = followingSet instanceof Set ? followingSet : new Set();
  const scores = new Map(); // uid -> { score, reasons:Set }

  const add = (target, points, reason) => {
    if (!target || target === uid || following.has(target)) return;
    const cur = scores.get(target) || { score: 0, reasons: new Set() };
    cur.score += points;
    cur.reasons.add(reason);
    scores.set(target, cur);
  };

  // --- social graph: friends-of-friends ---
  const mutualCounts = new Map();
  const firstHop = [...following].slice(0, 25);
  await Promise.all(
    firstHop.map(async (personIFollow) => {
      const theirFollows = await fetchFollowList(personIFollow, "following").catch(() => []);
      for (const f of theirFollows) {
        mutualCounts.set(f.id, (mutualCounts.get(f.id) || 0) + 1);
      }
    })
  );
  for (const [target, count] of mutualCounts) {
    // Diminishing returns so one hyper-connected account can't dominate.
    add(target, 4 * Math.log2(1 + count), REASONS.mutual(count));
  }

  // --- interest graph: collaborative filtering over affinity ---
  const affinity = await fetchAffinity().catch(() => new Map());
  const myTaste = [...affinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([authorId]) => authorId);

  await Promise.all(
    myTaste.map(async (author) => {
      // People who follow an author I like form a taste cluster; what else
      // that cluster follows is a candidate for me.
      const theirFollowers = await fetchFollowList(author, "followers").catch(() => []);
      await Promise.all(
        theirFollowers.slice(0, 8).map(async (peer) => {
          const peerFollows = await fetchFollowList(peer.id, "following").catch(() => []);
          for (const f of peerFollows) add(f.id, 1.5, REASONS.taste);
        })
      );
    })
  );

  // --- cold start / topping up ---
  if (scores.size < max) {
    const popular = await fetchPopularProfiles(max * 3).catch(() => []);
    for (const p of popular) {
      const age = Date.now() - tsMillis(p.createdAt);
      const isNew = age > 0 && age < 14 * 86400000;
      add(p.id, (p.followerCount || 0) * 0.05 + 0.5, isNew ? REASONS.fresh : REASONS.popular);
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, max);

  const profiles = await fetchProfilesByIds(ranked.map(([id]) => id));
  return ranked
    .map(([id, meta]) => {
      const profile = profiles.get(id);
      if (!profile) return null;
      return { ...profile, reason: [...meta.reasons][0], score: meta.score };
    })
    .filter(Boolean);
}

async function fetchPopularProfiles(n) {
  // No orderBy on followerCount: the list rule allows a plain signed-in read,
  // and sorting client-side avoids needing a composite index.
  const snap = await getDocs(query(collection(db, "users"), limit(Math.max(n, 50))));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
    .slice(0, n);
}

async function fetchProfilesByIds(ids) {
  const map = new Map();
  if (!ids.length) return map;
  // documentId() 'in' queries cap at 30 per call.
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(db, "users"), where("__name__", "in", chunk))
    ).catch(() => null);
    snap?.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  }
  return map;
}
