// Client-side search over a cached candidate pool (recent public posts,
// profiles, circles, news, gatherings).
//
// Ranking: field-weighted text relevance (exact > prefix > word start >
// substring > one typo), multiplied by personal affinity and log-scaled
// engagement with age decay. Every query token must match some field.
//
// This only sees what's in the pool; beyond a few thousand posts it needs a
// real index (Typesense, Meilisearch, Algolia).

import {
  fetchFeed, fetchGroups, fetchEvents, fetchNews, searchUsers,
  fetchAffinity, tsMillis, isHeld, me,
} from "./db";
import { db } from "../firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { interestById, newsTopicById } from "./interests";
import { assessText, hitsHiddenWords } from "./moderation";
import { settled } from "./fresh";

const topicWords = (ids) => (ids || []).map((id) => interestById(id)?.label || "").join(" ");

// Normalisation

export function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents: café → cafe
    .replace(/[^\p{L}\p{N}#@_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normalise(s).split(" ").filter(Boolean);
}

// Damerau–Levenshtein, capped at 2.
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } // transposition
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Scores one field; 0 if it doesn't match. */
function fieldScore(fieldText, q, qTokens) {
  const f = normalise(fieldText);
  if (!f) return { score: 0, matched: new Set() };
  if (f === q) return { score: 12, matched: new Set(qTokens) };

  const words = f.split(" ");
  const matched = new Set();
  let score = f.startsWith(q) ? 7 : f.includes(q) && q.includes(" ") ? 5 : 0;

  for (const t of qTokens) {
    let best = 0;
    for (const w of words) {
      const bare = w.replace(/^[#@]/, "");
      if (bare === t) best = Math.max(best, 4);
      else if (bare.startsWith(t)) best = Math.max(best, t.length >= 3 ? 3 : 1.5);
      else if (t.length >= 4 && bare.includes(t)) best = Math.max(best, 1.5);
      else if (t.length >= 5 && withinOneEdit(bare, t)) best = Math.max(best, 1.2);
      if (best === 4) break;
    }
    if (best > 0) matched.add(t);
    score += best;
  }
  return { score, matched };
}

/** Weighted multi-field score; 0 unless every token matches at least one field. */
function relevance(fields, q, qTokens) {
  let total = 0;
  const covered = new Set();
  for (const [text, weight] of fields) {
    const { score, matched } = fieldScore(text, q, qTokens);
    total += score * weight;
    matched.forEach((t) => covered.add(t));
  }
  if (covered.size < qTokens.length) return 0;
  return total;
}

const log1p = (n) => Math.log2(1 + Math.max(0, n || 0));
const ageDays = (t) => Math.max(0, (Date.now() - tsMillis(t)) / 86_400_000);
const decay = (t, halfLifeDays) => Math.pow(0.5, ageDays(t) / halfLifeDays);

// Candidate pools, cached briefly between keystrokes.

let pool = null;
let poolAt = 0;
const POOL_TTL = 2 * 60_000;

// People search needs an account, so profiles can't be listed anonymously.
async function fetchPeoplePool() {
  if (!me()) return [];
  const snap = await getDocs(query(collection(db, "users"), limit(300)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function loadPool({ force = false } = {}) {
  if (!force && pool && Date.now() - poolAt < POOL_TTL) return pool;
  const [posts, people, circles, gatherings, news, affinity] = await Promise.all([
    fetchFeed().catch(() => []),
    fetchPeoplePool().catch(() => []),
    fetchGroups().catch(() => []),
    fetchEvents().catch(() => []),
    fetchNews("approved").catch(() => []),
    fetchAffinity().catch(() => new Map()),
  ]);
  pool = { posts, people, circles, gatherings, news, affinity };
  poolAt = Date.now();
  return pool;
}

// Search

export const SECTIONS = {
  people: { title: "People" },
  strands: { title: "Strands" },
  flicks: { title: "Flicks" },
  stills: { title: "Stills" },
  news: { title: "News" },
  circles: { title: "Circles" },
  gatherings: { title: "Gatherings" },
};

const sectionFor = (post) =>
  post.kind === "text" || (post.kind === "post" && !post.mediaUrl) ? "strands"
  : post.kind === "post" ? "stills" : "flicks";

/** Resolves to { top, sections: [{ id, title, items, best }], total }, sections ordered by best score. */
export async function search(rawQuery, { following = new Set(), me = "", blocked = new Set(), muted = new Set(), hiddenWords = [] } = {}) {
  const q = normalise(rawQuery).replace(/^@/, "");
  const qTokens = tokens(q);
  if (!qTokens.length) return { top: null, sections: [], total: 0 };
    if (assessText(rawQuery).level === "block") return { top: null, sections: [], total: 0 };

  const [data, handleHits] = await Promise.all([
    loadPool(),
    // Exact handle lookup reaches accounts outside the pool.
    me ? searchUsers(q.replace(/\s/g, "")).catch(() => []) : [],
  ]);
  const { posts, people, circles, gatherings, news, affinity } = data;
  const results = [];

  const push = (section, item, rel, prior) => {
    if (rel <= 0) return;
    // Blocked accounts are excluded entirely; muted accounts only as post authors.
    if (blocked.has(item.authorId) || muted.has(item.authorId) || (section === "people" && blocked.has(item.id))) return;
        if (item.authorId && item.authorId !== me && isHeld(item)) return;
    if (item.authorId !== me && hitsHiddenWords(`${item.title || ""} ${item.text || ""}`, hiddenWords)) return;
    results.push({ section, item, score: rel * (1 + prior) });
  };

  const seenPeople = new Set();
  for (const u of [...handleHits, ...people]) {
    if (!u?.id || seenPeople.has(u.id) || u.id === me) continue;
    seenPeople.add(u.id);
    const rel = relevance([[u.username, 3.2], [u.name, 3], [u.bio, 0.7], [u.town, 0.6]], q, qTokens);
    const prior = 0.08 * log1p(u.followerCount) + (following.has(u.id) ? 0.5 : 0);
    push("people", u, rel, prior);
  }

  // Alt text is indexed too.
  for (const p of posts) {
    const rel = relevance(
      [[p.title, 2.6], [p.text, 1.4], [p.alt, 0.8], [p.authorName, 1.2], [p.authorDisplayName, 1], [topicWords(p.topics), 1.1],
        [p.poll ? p.poll.options.join(" ") : "", 0.6]],
      q, qTokens
    );
    const engagement =
      log1p(settled(p.likeCount, p.freshLikes)) * 0.05 + log1p(settled(p.commentCount, p.freshComments)) * 0.07 +
      log1p(settled(p.saveCount, p.freshSaves)) * 0.08 + log1p(settled(p.repostCount, p.freshReposts)) * 0.08;
    const personal = (following.has(p.authorId) ? 0.35 : 0) + Math.min(log1p(affinity.get(p.authorId)) * 0.08, 0.4);
    const prior = engagement + personal + 0.4 * decay(p.createdAt, 14);
        const damp = !following.has(p.authorId) && assessText(`${p.title || ""}\n${p.text || ""}`).level !== "ok" ? 0.2 : 1;
    push(sectionFor(p), p, rel * damp * (1 - Math.min(p.reportCount || 0, 4) * 0.15), prior);
  }

  for (const n of news) {
    const rel = relevance([[n.title, 2.8], [newsTopicById(n.topic)?.label, 1.2], [n.script, 0.9], [n.authorName, 0.8]], q, qTokens);
    push("news", n, rel, 0.6 * decay(n.createdAt, 7));
  }

  for (const g of circles) {
    // Match circle interests as well as names.
    const rel = relevance([[g.name, 3], [topicWords(g.interests), 1.8], [g.description, 1]], q, qTokens);
    push("circles", g, rel, 0.1 * log1p(g.memberCount));
  }

  for (const ev of gatherings) {
    const start = ev.startsAt?.toMillis?.() || 0;
    if (start && start < Date.now() - 86_400_000) continue;
    const rel = relevance([[ev.title, 3], [ev.location, 1.6], [ev.description, 0.8]], q, qTokens);
    push("gatherings", ev, rel, 0.1 * log1p(ev.goingCount));
  }

  results.sort((a, b) => b.score - a.score);

  const bySection = new Map();
  for (const r of results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  const sections = [...bySection.entries()]
    .map(([id, rs]) => ({ id, title: SECTIONS[id].title, best: rs[0].score, items: rs.map((r) => r.item) }))
    .sort((a, b) => b.best - a.best);

  // Only promote a top result when it clearly beats the rest.
  const [first, second] = results;
  const top = first && (!second || first.score >= second.score * 1.35)
    ? { section: first.section, item: first.item }
    : null;

  return { top, sections, total: results.length };
}

// Recent searches (localStorage only).

const RECENT_KEY = "mesh:recent-searches";
const RECENT_MAX = 8;

export function recentSearches() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(term) {
  const t = String(term || "").trim();
  if (t.length < 2) return recentSearches();
  const next = [t, ...recentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage blocked: skip */ }
  return next;
}

export function forgetSearch(term) {
  const next = recentSearches().filter((x) => x !== term);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  return [];
}
