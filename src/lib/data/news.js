// News submissions, review and corrections.
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp,
  Timestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteInline } from "./posts.js";
import { fetchProfile } from "./users.js";

// ---------- news (reviewed against sources before publication) ----------

export async function submitNews({ title, script, sources, topic = "world", keyPoints = [], location = "", coverUrl = "" }) {
  const profile = await fetchProfile(me());
  const item = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    title,
    script,       // [1], [2]… in the text cite the numbered sources
    sources, // array of URLs
    topic,
    keyPoints: keyPoints.slice(0, 3),
    location,
    coverUrl,
    corrections: [],
    status: "pending",
    reviewNote: "",
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    // Only ever set by ticking the declaration in the submit form.
    attestedAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "news"), item);
  return { id: refDoc.id, ...item, createdAt: Timestamp.now() };
}

export async function fetchNews(status = "approved") {
  const q = query(collection(db, "news"), where("status", "==", status), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function fetchMyNews() {
  const q = query(collection(db, "news"), where("authorId", "==", me()), limit(50));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function isAdmin() {
  const snap = await getDoc(doc(db, "admins", me()));
  return snap.exists();
}

export async function reviewNews(id, status, reviewNote = "") {
  const profile = await fetchProfile(me());
  await updateDoc(doc(db, "news", id), {
    status,
    reviewNote,
    reviewedBy: profile?.username || "",
    reviewedAt: serverTimestamp(),
  });
}

/** Authors can withdraw a submission; reviewers can take a story down. */
export async function deleteNews(id) {
  const story = await fetchNewsStory(id);
  await deleteDoc(doc(db, "news", id));
  await deleteInline(story?.coverUrl);
}

export async function fetchNewsStory(id) {
  const snap = await getDoc(doc(db, "news", id)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Anyone can flag an error; only admins read the flags. */
export async function suggestCorrection(storyId, text) {
  const profile = await fetchProfile(me());
  await addDoc(collection(db, "news", storyId, "correctionRequests"), {
    authorId: me(),
    authorName: profile?.username || "",
    text,
    createdAt: serverTimestamp(),
  });
}

export async function fetchCorrectionRequests(storyId) {
  const q = query(collection(db, "news", storyId, "correctionRequests"), limit(100));
  return snapToList(await getDocs(q));
}

/** Admins append a public correction to a published story. It's never edited away. */
export async function addCorrection(story, note) {
  await updateDoc(doc(db, "news", story.id), {
    corrections: arrayUnion({ note, at: Timestamp.now() }),
  });
}
