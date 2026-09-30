// Stories: 24-hour photos and clips, with likes (for the author only),
// replies (a private message to the author) and echoes (public replies that
// everyone who can see the story can read).
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteInline } from "./posts.js";
import { fetchProfile } from "./users.js";
import { notify, unnotify } from "./notifications.js";
import { openDirectChat, sendMessage } from "./chats.js";

export const STORY_MS = 24 * 3600 * 1000;
export const ECHO_MAX = 300;
export const storyExpired = (story, now = Date.now()) => now - tsMillis(story.createdAt) >= STORY_MS;

// ---------- stories (24h) ----------

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/* A private account's stories are for its followers only. Each story
   carries its day so the last 24 hours can be fetched without a composite
   index. */
export async function createStory({ mediaUrl, mediaPath, mediaType }) {
  const profile = await fetchProfile(me());
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

/** Take down one of your own stories, with its likes and echoes (and the photo it used). */
export async function deleteStory(story) {
  const sub = async (name) => (await getDocs(query(collection(db, "stories", story.id, name), limit(400))).catch(() => null))?.docs || [];
  const [likes, echoes] = await Promise.all([sub("likes"), sub("echoes")]);
  const batch = writeBatch(db);
  [...likes, ...echoes].slice(0, 490).forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "stories", story.id));
  await batch.commit();
  await deleteInline(story.mediaUrl);
}

/** One story by id, for opening it from a notification. Null if it's gone. */
export async function fetchStory(id) {
  const snap = await getDoc(doc(db, "stories", id)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------- likes: only the story's author sees them ----------

export async function hasLikedStory(storyId) {
  const snap = await getDoc(doc(db, "stories", storyId, "likes", me())).catch(() => null);
  return !!snap?.exists();
}

export async function likeStory(story, on) {
  const ref = doc(db, "stories", story.id, "likes", me());
  if (on) {
    const p = await fetchProfile(me());
    await setDoc(ref, { username: p?.username || "", createdAt: serverTimestamp() });
    notify(story.authorId, "storylike", { ref: story.id });
  } else {
    await deleteDoc(ref);
    unnotify(story.authorId, "storylike", { ref: story.id });
  }
}

/** Who liked your story, newest first. */
export async function fetchStoryLikes(storyId) {
  const snap = await getDocs(query(collection(db, "stories", storyId, "likes"), limit(500)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

// ---------- echoes: public replies on a story ----------

export async function fetchEchoes(storyId) {
  const snap = await getDocs(query(collection(db, "stories", storyId, "echoes"), orderBy("createdAt", "asc"), limit(200)));
  return snapToList(snap);
}

export async function addEcho(story, text) {
  const profile = await fetchProfile(me());
  const echo = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text: text.slice(0, ECHO_MAX),
    createdAt: serverTimestamp(),
  };
  // The echo and your comment pace go together, like a comment.
  const ref = doc(collection(db, "stories", story.id, "echoes"));
  const batch = writeBatch(db);
  batch.set(ref, echo);
  batch.set(doc(db, "rateLimits", me()), { comment: serverTimestamp() }, { merge: true });
  await batch.commit();
  notify(story.authorId, "echo", { ref: story.id, commentId: ref.id, text: echo.text.slice(0, 140) });
  return { id: ref.id, ...echo, createdAt: Timestamp.now() };
}

/** Your own echo, or any echo on your own story. */
export async function deleteEcho(story, echo) {
  await deleteDoc(doc(db, "stories", story.id, "echoes", echo.id));
  if (echo.authorId === me()) unnotify(story.authorId, "echo", { commentId: echo.id });
}

// ---------- replies: a private message to the story's author ----------

/** Sends `text` (or a quick reaction) to the author, showing which story it answers. */
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
  const byAuthor = new Map();
  for (const s of list) {
    if (!byAuthor.has(s.authorId)) byAuthor.set(s.authorId, { authorId: s.authorId, authorName: s.authorName, authorPhoto: s.authorPhoto, items: [] });
    byAuthor.get(s.authorId).items.push(s);
  }
  return [...byAuthor.values()];
}
