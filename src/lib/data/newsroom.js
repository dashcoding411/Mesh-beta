// Newsroom: writers, drafts, co-authoring, revisions and live blogs.
// Document model and merge logic live in ../storyDoc.js.

import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchProfile, myProfile, uidForUsername } from "./users.js";
import { blocksFromDoc, blocksToDoc, mergeStory, newBlock } from "../storyDoc.js";

const storyRef = (id) => doc(db, "news", id);

// Writers

export async function isNewsWriter(uid = me()) {
  const snap = await getDoc(doc(db, "newsWriters", uid)).catch(() => null);
  return !!snap?.exists();
}

export async function fetchWriters() {
  return snapToList(await getDocs(query(collection(db, "newsWriters"), limit(200))));
}

export async function addWriter(handle) {
  const uid = await uidForUsername(handle);
  if (!uid) throw new Error("There's no account with that handle.");
  const p = await fetchProfile(uid);
  await setDoc(doc(db, "newsWriters", uid), { username: p.username, addedBy: me(), addedAt: serverTimestamp() });
  return { id: uid, username: p.username };
}

export async function removeWriter(uid) {
  await deleteDoc(doc(db, "newsWriters", uid));
}

// Stories

export function storyFromDoc(snap) {
  const d = snap.data();
  const points = d.keyPoints || [];
  return {
    id: snap.id,
    title: d.title || "",
    standfirst: d.standfirst || "",
    topic: d.topic || "world",
    location: d.location || "",
    coverUrl: d.coverUrl || "",
    keyPoints: [points[0] || "", points[1] || "", points[2] || ""],
    sources: d.sources || [],
    format: d.format || "story",
    legalHold: !!d.legalHold,
    legalNote: d.legalNote || "",
    blocks: blocksFromDoc(d),
    authorId: d.authorId,
    authors: d.authors || [d.authorId],
    authorNames: d.authorNames || [d.authorName],
    status: d.status,
    version: d.version || 0,
    reviewNote: d.reviewNote || "",
    live: !!d.live,
    updatedAt: d.updatedAt,
  };
}

function storyFields(s) {
  return {
    title: s.title.slice(0, 200),
    standfirst: s.standfirst.slice(0, 300),
    topic: s.topic,
    location: s.location.trim().slice(0, 80),
    coverUrl: s.coverUrl || "",
    keyPoints: s.keyPoints.map((k) => k.trim()).filter(Boolean).slice(0, 3).map((k) => k.slice(0, 200)),
    sources: s.sources.map((u) => u.trim()).filter(Boolean).slice(0, 10),
    format: s.format,
    legalHold: !!s.legalHold,
    legalNote: (s.legalNote || "").slice(0, 300),
    authors: s.authors,
    authorNames: s.authorNames,
    ...blocksToDoc(s.blocks),
  };
}

export async function createNewsStory(format = "story") {
  const p = await myProfile();
  const ref_ = await addDoc(collection(db, "news"), {
    authorId: me(),
    authorName: p.username,
    authors: [me()],
    authorNames: [p.username],
    title: "",
    standfirst: "",
    topic: "world",
    location: "",
    coverUrl: "",
    keyPoints: [],
    sources: [],
    format,
    live: false,
    legalHold: false,
    legalNote: "",
    ...blocksToDoc([newBlock("p", "")]),
    corrections: [],
    status: "draft",
    reviewNote: "",
    likeCount: 0,
    commentCount: 0,
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref_.id;
}

export function listenStory(id, onChange, onError) {
  return onSnapshot(storyRef(id), (snap) => onChange(snap.exists() ? storyFromDoc(snap) : null), onError);
}

export async function fetchMyStories() {
  const [shared, legacy] = await Promise.all([
    getDocs(query(collection(db, "news"), where("authors", "array-contains", me()), limit(100))).then(snapToList).catch(() => []),
    getDocs(query(collection(db, "news"), where("authorId", "==", me()), limit(100))).then(snapToList).catch(() => []),
  ]);
  const byId = new Map([...legacy, ...shared].map((s) => [s.id, s]));
  return [...byId.values()].sort((a, b) => tsMillis(b.updatedAt || b.createdAt) - tsMillis(a.updatedAt || a.createdAt));
}

// Optimistic concurrency on `version`: if another save landed since `base`,
// local changes are three-way merged onto the server copy before writing.
export async function saveStory(id, base, local, extra = {}) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(storyRef(id));
    if (!snap.exists()) throw new Error("gone");
    const server = storyFromDoc(snap);
    const merged = server.version !== base.version;
    const next = merged ? mergeStory(base, server, local) : local;
    const version = server.version + 1;
    tx.update(storyRef(id), { ...storyFields(next), ...extra, version, updatedAt: serverTimestamp() });
    return { story: { ...next, version, status: extra.status || server.status }, merged };
  });
}

export async function submitStory(id, base, local) {
  const result = await saveStory(id, base, local, { status: "pending", submittedAt: serverTimestamp(), attestedAt: serverTimestamp() });
  await saveRevision(id, result.story, "Sent for review").catch(() => {});
  return result;
}

export async function reopenStory(id, base, local) {
  return saveStory(id, base, local, { status: "draft" });
}

export async function coAuthorFor(handle) {
  const uid = await uidForUsername(handle);
  if (!uid) throw new Error("There's no account with that handle.");
  if (uid === me()) throw new Error("That's you.");
  if (!(await isNewsWriter(uid))) throw new Error(`@${handle} isn't a Mesh News writer. An admin can add them.`);
  const p = await fetchProfile(uid);
  return { id: uid, username: p.username };
}

// Revisions

export async function saveRevision(id, story, note = "") {
  const p = await myProfile();
  const fields = storyFields(story);
  await addDoc(collection(db, "news", id, "revisions"), {
    title: fields.title, standfirst: fields.standfirst, script: fields.script,
    blockIds: fields.blockIds, blockTypes: fields.blockTypes, blockTexts: fields.blockTexts,
    blockMedia: fields.blockMedia, blockAlts: fields.blockAlts, sources: fields.sources,
    version: story.version || 0, note: note.slice(0, 200), by: me(), byName: p.username, at: serverTimestamp(),
  });
}

export async function fetchRevisions(id) {
  const snap = await getDocs(query(collection(db, "news", id, "revisions"), orderBy("at", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), blocks: blocksFromDoc(d.data()) }));
}

// Presence (block locks)

export function listenStoryPresence(id, onChange) {
  return onSnapshot(collection(db, "news", id, "presence"),
    (snap) => onChange(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => onChange([]));
}

export async function setStoryPresence(id, blockId, username) {
  await setDoc(doc(db, "news", id, "presence", me()), { blockId, username, at: serverTimestamp() });
}

export async function clearStoryPresence(id) {
  await deleteDoc(doc(db, "news", id, "presence", me())).catch(() => {});
}

// Review

export async function clearLegalHold(id) {
  await updateDoc(storyRef(id), { legalHold: false, legalNote: "" });
}

// Live blogs

export function listenLiveUpdates(id, onChange) {
  return onSnapshot(query(collection(db, "news", id, "updates"), orderBy("at", "desc"), limit(200)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => onChange([]));
}

export async function postLiveUpdate(id, text, key = false) {
  const p = await myProfile();
  await addDoc(collection(db, "news", id, "updates"), { text: text.slice(0, 1500), by: me(), byName: p.username, key: !!key, at: serverTimestamp() });
}

export async function deleteLiveUpdate(id, updateId) {
  await deleteDoc(doc(db, "news", id, "updates", updateId));
}

export async function setLive(id, on) {
  await updateDoc(storyRef(id), { live: !!on, updatedAt: serverTimestamp() });
}
