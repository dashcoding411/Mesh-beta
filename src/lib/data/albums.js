// Saved albums (users/{uid}/albums): your saved posts filed into named
// groups, like collections on Instagram. A post can be in several albums.
// Private to you. Unsaving a post takes it out of every album.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";

export const ALBUM_NAME_MAX = 30;
export const MAX_ALBUM_POSTS = 500;

const albumsOf = () => collection(db, "users", me(), "albums");
const albumRef = (id) => doc(db, "users", me(), "albums", id);

/** The picture an album shows: a post's photo, a Flick's poster or video, or nothing for a Strand. */
export function coverOf(post) {
  if (!post) return { coverUrl: "", coverType: "" };
  if (post.kind === "short" || post.kind === "video") {
    return post.posterUrl ? { coverUrl: post.posterUrl, coverType: "image" } : { coverUrl: post.mediaUrl || "", coverType: "video" };
  }
  if (post.kind === "post" && post.mediaUrl) return { coverUrl: post.mediaUrl, coverType: "image" };
  return { coverUrl: "", coverType: "" };
}

// The newest post that has a picture; Strands don't.
const coverFrom = (posts) => coverOf([...posts].reverse().find((p) => coverOf(p).coverUrl));

export async function fetchAlbums() {
  if (!me()) return [];
  const list = snapToList(await getDocs(query(albumsOf(), limit(100))));
  return list.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
}

/** The album's posts, newest added first, skipping deleted ones. */
export async function fetchAlbumPosts(album) {
  const posts = await Promise.all([...album.postIds].reverse().map(async (id) => {
    const snap = await getDoc(doc(db, "posts", id)).catch(() => null);
    return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
  }));
  return posts.filter(Boolean);
}

export async function createAlbum(name, posts = []) {
  const ref = await addDoc(albumsOf(), {
    name: name.trim().slice(0, ALBUM_NAME_MAX),
    postIds: posts.map((p) => p.id).slice(0, MAX_ALBUM_POSTS),
    ...coverFrom(posts),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameAlbum(album, name) {
  await updateDoc(albumRef(album.id), { name: name.trim().slice(0, ALBUM_NAME_MAX), updatedAt: serverTimestamp() });
}

/** Replace the album's posts (from the picker). The newest with a picture is the cover. */
export async function setAlbumPosts(album, posts) {
  await updateDoc(albumRef(album.id), {
    postIds: posts.map((p) => p.id).slice(0, MAX_ALBUM_POSTS),
    ...coverFrom(posts),
    updatedAt: serverTimestamp(),
  });
}

export async function addToAlbum(album, post) {
  if (album.postIds.includes(post.id)) return;
  if (album.postIds.length >= MAX_ALBUM_POSTS) throw new Error(`An album holds up to ${MAX_ALBUM_POSTS} posts.`);
  const cover = coverOf(post);
  await updateDoc(albumRef(album.id), { postIds: arrayUnion(post.id), ...(cover.coverUrl ? cover : {}), updatedAt: serverTimestamp() });
}

export async function removeFromAlbum(album, postId) {
  await updateDoc(albumRef(album.id), { postIds: arrayRemove(postId), updatedAt: serverTimestamp() });
}

/** After unsaving: out of every album it was in. */
export async function removeFromAllAlbums(postId) {
  if (!me()) return;
  const snap = await getDocs(query(albumsOf(), where("postIds", "array-contains", postId), limit(100)));
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { postIds: arrayRemove(postId), updatedAt: serverTimestamp() })));
}

export async function deleteAlbum(album) {
  await deleteDoc(albumRef(album.id));
}
