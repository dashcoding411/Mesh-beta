// Stories: 24-hour photos and clips.
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteInline } from "./posts.js";
import { fetchProfile } from "./users.js";

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

/** Take down one of your own stories (and the photo it used). */
export async function deleteStory(story) {
  await deleteDoc(doc(db, "stories", story.id));
  await deleteInline(story.mediaUrl);
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
