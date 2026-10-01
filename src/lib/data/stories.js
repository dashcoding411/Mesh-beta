// Stories (24h) with author-only views and likes, DM replies, and public echoes.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteInline } from "./posts.js";
import { myProfile } from "./users.js";
import { notify, unnotify } from "./notifications.js";
import { openDirectChat, sendMessage } from "./chats.js";

export const STORY_MS = 24 * 3600 * 1000;
export const ECHO_MAX = 300;
export const storyExpired = (story, now = Date.now()) => now - tsMillis(story.createdAt) >= STORY_MS;

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// `day` lets the last 24h be queried with an `in` filter instead of a composite index.
export async function createStory({ mediaUrl, mediaPath, mediaType }) {
  const profile = await myProfile();
  const story = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "unknown",
    authorPhoto: profile?.photoURL || "",
    mediaUrl,
    mediaPath,
    mediaType,
    audience: profile?.isPrivate ? "followers" : "public",
    day: dayKey(Date.now()),
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "stories"), story);
}

export async function deleteStory(story) {
  const sub = async (name) => (await getDocs(query(collection(db, "stories", story.id, name), limit(2000))).catch(() => null))?.docs || [];
  const records = (await Promise.all(["views", "likes", "echoes"].map(sub))).flat();
  // Subcollections first: their delete rules read the parent story.
  for (let i = 0; i < records.length; i += 450) {
    const batch = writeBatch(db);
    records.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "stories", story.id));
  await deleteInline(story.mediaUrl);
}

// Views

const viewed = new Set(); // story ids this account has seen

/** Seen by the viewer (their own stories always count as seen). */
export function storySeen(story) {
  return story.authorId === me() || viewed.has(story.id);
}

export async function markStoryViewed(story) {
  if (!me() || story.authorId === me() || viewed.has(story.id)) return;
  viewed.add(story.id);
  try {
    const ref = doc(db, "stories", story.id, "views", me());
    if ((await getDoc(ref)).exists()) return;
    const p = await myProfile();
    await setDoc(ref, { username: p?.username || "", createdAt: serverTimestamp() });
  } catch { /* not counted; nothing to tell the viewer */ }
}

export async function fetchStoryViews(storyId) {
  const snap = await getDocs(query(collection(db, "stories", storyId, "views"), limit(2000)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function fetchStory(id) {
  const snap = await getDoc(doc(db, "stories", id)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Likes

export async function hasLikedStory(storyId) {
  const snap = await getDoc(doc(db, "stories", storyId, "likes", me())).catch(() => null);
  return !!snap?.exists();
}

export async function likeStory(story, on) {
  const ref = doc(db, "stories", story.id, "likes", me());
  if (on) {
    const p = await myProfile();
    await setDoc(ref, { username: p?.username || "", createdAt: serverTimestamp() });
    notify(story.authorId, "storylike", { ref: story.id });
  } else {
    await deleteDoc(ref);
    unnotify(story.authorId, "storylike", { ref: story.id });
  }
}

export async function fetchStoryLikes(storyId) {
  const snap = await getDocs(query(collection(db, "stories", storyId, "likes"), limit(500)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

// Echoes

export async function fetchEchoes(storyId) {
  const snap = await getDocs(query(collection(db, "stories", storyId, "echoes"), orderBy("createdAt", "asc"), limit(200)));
  return snapToList(snap);
}

export async function addEcho(story, text) {
  const profile = await myProfile();
  const echo = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text: text.slice(0, ECHO_MAX),
    createdAt: serverTimestamp(),
  };
  // Shares the comment rate limit.
  const ref = doc(collection(db, "stories", story.id, "echoes"));
  const batch = writeBatch(db);
  batch.set(ref, echo);
  batch.set(doc(db, "rateLimits", me()), { comment: serverTimestamp() }, { merge: true });
  await batch.commit();
  notify(story.authorId, "echo", { ref: story.id, commentId: ref.id, text: echo.text.slice(0, 140) });
  return { id: ref.id, ...echo, createdAt: Timestamp.now() };
}

export async function deleteEcho(story, echo) {
  await deleteDoc(doc(db, "stories", story.id, "echoes", echo.id));
  if (echo.authorId === me()) unnotify(story.authorId, "echo", { commentId: echo.id });
}

// Replies

export async function replyToStory(story, text) {
  const chatId = await openDirectChat({ id: story.authorId, username: story.authorName });
  await sendMessage(chatId, text.slice(0, 2000), {
    storyReply: { id: story.id, authorId: story.authorId, mediaUrl: story.mediaUrl, mediaType: story.mediaType || "" },
  });
  return chatId;
}

export async function fetchActiveStories(followingSet = new Set()) {
  const days = [dayKey(Date.now()), dayKey(Date.now() - 86400000)];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const run = (q) => getDocs(q).then(snapToList).catch(() => []);
  const followed = [...followingSet].slice(0, 30);
  const lists = await Promise.all([
    run(query(collection(db, "stories"), where("audience", "==", "public"), where("day", "in", days), limit(200))),
    run(query(collection(db, "stories"), where("authorId", "==", me()), where("day", "in", days), limit(50))),
    ...followed.map((uid) => run(query(collection(db, "stories"),
      where("authorId", "==", uid), where("audience", "==", "followers"), where("day", "in", days), limit(20)))),
  ]);
  const seen = new Set();
  const list = lists.flat()
    .filter((s) => !seen.has(s.id) && seen.add(s.id) && tsMillis(s.createdAt) > cutoff)
    .sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  // Which of the others' stories this account has already seen.
  const uid = me();
  await Promise.all(list.filter((s) => s.authorId !== uid && !viewed.has(s.id)).map((s) =>
    getDoc(doc(db, "stories", s.id, "views", uid))
      .then((d) => { if (d.exists()) viewed.add(s.id); })
      .catch(() => {})));
  const byAuthor = new Map();
  for (const s of list) {
    if (!byAuthor.has(s.authorId)) byAuthor.set(s.authorId, { authorId: s.authorId, authorName: s.authorName, authorPhoto: s.authorPhoto, items: [] });
    byAuthor.get(s.authorId).items.push(s);
  }
  return [...byAuthor.values()];
}
