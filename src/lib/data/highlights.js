// Story highlights (users/{uid}/highlights): named sets of past stories kept
// on the profile. Each story keeps its own audience, so a followers-only
// story in a highlight still only plays for followers.
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchStory } from "./stories.js";

export const MAX_HIGHLIGHT_STORIES = 100;
export const HIGHLIGHT_TITLE_MAX = 24;

const highlightsOf = (uid) => collection(db, "users", uid, "highlights");
const cover = (story) => ({ coverUrl: story?.mediaUrl || "", coverType: story?.mediaType || "" });

export async function fetchHighlights(uid) {
  const list = snapToList(await getDocs(query(highlightsOf(uid), limit(50))));
  return list.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
}

/** Every story you've posted, newest first. Only you can list your expired ones. */
export async function fetchMyStoryArchive() {
  const snap = await getDocs(query(collection(db, "stories"), where("authorId", "==", me()), limit(500)));
  return snapToList(snap).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/** A highlight's stories in order, skipping deleted ones and any the viewer can't see. */
export async function fetchHighlightStories(highlight, ownerId) {
  const stories = await Promise.all(highlight.storyIds.map((id) => fetchStory(id).catch(() => null)));
  return stories.filter((s) => s && s.authorId === ownerId);
}

export async function createHighlight(title, stories, coverStory = stories[0]) {
  const ids = stories.map((s) => s.id).slice(0, MAX_HIGHLIGHT_STORIES);
  const ref = await addDoc(highlightsOf(me()), {
    title: title.trim().slice(0, HIGHLIGHT_TITLE_MAX),
    storyIds: ids,
    ...cover(coverStory),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Rename, or change which stories are in it (oldest first, like they were posted). */
export async function updateHighlight(highlight, { title = highlight.title, stories, coverStory }) {
  const changes = { title: title.trim().slice(0, HIGHLIGHT_TITLE_MAX), updatedAt: serverTimestamp() };
  if (stories) {
    changes.storyIds = stories.map((s) => s.id).slice(0, MAX_HIGHLIGHT_STORIES);
    // Keep the cover if its story is still in; otherwise use the first.
    if (!stories.some((s) => s.mediaUrl === highlight.coverUrl)) Object.assign(changes, cover(stories[0]));
  }
  if (coverStory) Object.assign(changes, cover(coverStory));
  await updateDoc(doc(db, "users", me(), "highlights", highlight.id), changes);
}

export async function addToHighlight(highlight, story) {
  if (highlight.storyIds.includes(story.id)) return;
  if (highlight.storyIds.length >= MAX_HIGHLIGHT_STORIES) throw new Error(`A highlight holds up to ${MAX_HIGHLIGHT_STORIES} stories.`);
  await updateDoc(doc(db, "users", me(), "highlights", highlight.id), {
    storyIds: [...highlight.storyIds, story.id], updatedAt: serverTimestamp(),
  });
}

export async function deleteHighlight(highlight) {
  await deleteDoc(doc(db, "users", me(), "highlights", highlight.id));
}
