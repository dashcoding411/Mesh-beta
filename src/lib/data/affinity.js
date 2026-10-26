// A private score per account you interact with, for ordering your feed. It's
// one document, users/{uid}/affinity/all = { scores: { authorId: { s, t } } },
// so the feed reads one document rather than hundreds. Bumps are added up on
// this device and written together, at most once a minute (and when Mesh is
// hidden), so swiping through Flicks doesn't write once per video. An account
// you haven't interacted with for 90 days is forgotten, and only the 500 most
// recent are kept.
import {
  collection, deleteField, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, tsMillis } from "./core.js";

const AFFINITY_DAYS = 90;
const AFFINITY_MAX = 500;
const FLUSH_MS = 60_000;
const FRESH_MS = 10 * 60_000;
const ALL = "all";

const allRef = (uid) => doc(db, "users", uid, "affinity", ALL);

let pending = { uid: null, bumps: new Map() };
let timer = null;
let cache = null; // { uid, map, at }

/** Adds to an account's score. Saved within a minute, with any others. */
export function bumpAffinity(authorId, amount) {
  const uid = me();
  if (!uid || !authorId || authorId === uid || !amount) return Promise.resolve();
  if (pending.uid !== uid) pending = { uid, bumps: new Map() };
  pending.bumps.set(authorId, (pending.bumps.get(authorId) || 0) + amount);
  if (cache?.uid === uid) cache.map.set(authorId, (cache.map.get(authorId) || 0) + amount);
  timer ||= setTimeout(flushAffinity, FLUSH_MS);
  return Promise.resolve();
}

/** Writes the bumps waiting on this device, if any. */
export async function flushAffinity() {
  clearTimeout(timer);
  timer = null;
  const { uid, bumps } = pending;
  if (!uid || !bumps.size || uid !== me()) return;
  pending = { uid, bumps: new Map() };
  const scores = {};
  for (const [id, n] of bumps) scores[id] = { s: increment(n), t: serverTimestamp() };
  try {
    await setDoc(allRef(uid), { scores }, { merge: true });
  } catch {
    // Kept for the next try.
    for (const [id, n] of bumps) pending.bumps.set(id, (pending.bumps.get(id) || 0) + n);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAffinity();
  });
}

// Before the single document, each account had its own (updatedAt, score).
async function migrate(uid) {
  const old = await getDocs(query(collection(db, "users", uid, "affinity"), limit(AFFINITY_MAX))).catch(() => null);
  const docs = (old?.docs || []).filter((d) => d.id !== ALL);
  const scores = {};
  for (const d of docs) scores[d.id] = { s: d.data().score || 0, t: d.data().updatedAt || null };
  // Written even when empty, so this only runs once. The old ones go only
  // once the new one is saved.
  const saved = await setDoc(allRef(uid), { scores }, { merge: true }).then(() => true, () => false);
  if (saved && docs.length) {
    const batch = writeBatch(db);
    docs.forEach((d) => batch.delete(d.ref));
    await batch.commit().catch(() => {});
  }
  return scores;
}

/**
 * Splits stored scores into those kept ([id, score], most recent first) and
 * the ids to forget: untouched for 90 days, or beyond the 500 most recent.
 * One not yet stamped by the server (a write in flight) counts as now.
 */
export function sortScores(scores, now = Date.now()) {
  const cutoff = now - AFFINITY_DAYS * 86400000;
  const entries = Object.entries(scores || {})
    .map(([id, v]) => [id, Number(v?.s) || 0, v?.t ? tsMillis(v.t) : now])
    .sort((a, b) => b[2] - a[2]);
  const kept = entries.filter((e, i) => e[2] >= cutoff && i < AFFINITY_MAX);
  const keptIds = new Set(kept.map((e) => e[0]));
  return { keep: kept.map(([id, s]) => [id, s]), forget: entries.filter((e) => !keptIds.has(e[0])).map((e) => e[0]) };
}

/** Scores by account id. Read at most every ten minutes. */
export async function fetchAffinity() {
  const uid = me();
  if (!uid) return new Map();
  if (cache?.uid === uid && Date.now() - cache.at < FRESH_MS) return new Map(cache.map);
  const snap = await getDoc(allRef(uid));
  const scores = snap.exists() ? snap.data().scores || {} : await migrate(uid);

  const { keep, forget } = sortScores(scores);
  if (forget.length) {
    updateDoc(allRef(uid), Object.fromEntries(forget.map((id) => [`scores.${id}`, deleteField()]))).catch(() => {});
  }

  const map = new Map(keep);
  // Bumps not yet written still count.
  if (pending.uid === uid) for (const [id, n] of pending.bumps) map.set(id, (map.get(id) || 0) + n);
  cache = { uid, map, at: Date.now() };
  return new Map(map);
}
