// Published news, correction requests and corrections.
import {
  addDoc, arrayUnion, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { deleteInline } from "./posts.js";
import { myProfile } from "./users.js";

export async function fetchNews(status = "approved") {
  const q = query(collection(db, "news"), where("status", "==", status), orderBy("createdAt", "desc"), limit(100));
  return snapToList(await getDocs(q));
}

export async function isAdmin() {
  if (!me()) return false;
  const snap = await getDoc(doc(db, "admins", me()));
  return snap.exists();
}

export async function deleteNews(id) {
  const story = await fetchNewsStory(id);
  // Subcollections go in the same batch; their delete rules check the story is gone.
  const sub = async (name) => (await getDocs(collection(db, "news", id, name)).catch(() => null))?.docs || [];
  const batch = writeBatch(db);
  for (const name of ["revisions", "updates", "presence"]) (await sub(name)).slice(0, 150).forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "news", id));
  await batch.commit();
  await deleteInline(story?.coverUrl);
}

export async function fetchNewsStory(id) {
  const snap = await getDoc(doc(db, "news", id)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function suggestCorrection(storyId, text) {
  const profile = await myProfile();
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

/** Corrections are append-only (enforced by the rules). */
export async function addCorrection(story, note) {
  await updateDoc(doc(db, "news", story.id), {
    corrections: arrayUnion({ note, at: Timestamp.now() }),
  });
}
