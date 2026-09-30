// Photos and voice notes without Cloud Storage.
//
// Cloud Storage needs Firebase's paid Blaze plan. Until that's switched on,
// small media lives in Firestore instead: photos are resized and compressed
// in the browser to well under Firestore's 1 MiB document limit, and voice
// notes are recorded at speech quality (~24 kbps), so a minute is ~180 KB.
// A post then points at `mesh-media:<id>` rather than a Storage URL, and
// every <img> resolves that through useMediaSrc().
//
// Video is still Storage-only: even a short clip is far past what a
// document can hold. When Storage is on, photos go there too, automatically.

import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../firebase";

export const INLINE_PREFIX = "mesh-media:";
const MAX_DATA_CHARS = 900_000; // base64 text; the rules cap it too
const cache = new Map(); // id -> Promise<string>

export const isInline = (url) => typeof url === "string" && url.startsWith(INLINE_PREFIX);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read.")); };
    img.src = url;
  });
}

/* Resize to at most `maxSide` px and step the quality down until it fits.
   WebP where the browser can encode it (smaller), JPEG otherwise. Animated
   GIFs lose their animation here, which is why GIFs come from GIPHY instead. */
export async function compressImage(file, { maxSide = 1440, budget = MAX_DATA_CHARS * 0.85 } = {}) {
  const img = await loadImage(file);
  let side = maxSide;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58, 0.46]) {
      let data = canvas.toDataURL("image/webp", q);
      if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= budget) return { data, width: w, height: h };
    }
    side = Math.round(side * 0.75);
  }
  throw new Error("That image is too detailed to post without Cloud Storage. Try a smaller one.");
}

/** Store a photo; returns a `mesh-media:` URL to put on the post, avatar or story. */
export async function storeInlineImage(file, { maxSide } = {}) {
  const { data, width, height } = await compressImage(file, maxSide ? { maxSide } : undefined);
  // With its rate-limit stamp: the rules allow one photo every few seconds.
  const ref_ = doc(collection(db, "media"));
  const batch = writeBatch(db);
  batch.set(ref_, {
    ownerId: auth.currentUser.uid,
    kind: "image",
    data,
    width,
    height,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "rateLimits", auth.currentUser.uid), { media: serverTimestamp() }, { merge: true });
  try { await batch.commit(); }
  catch (err) {
    if (err?.code === "permission-denied") throw new Error("You're uploading photos very quickly. Wait a few seconds and try again.");
    throw err;
  }
  return { url: INLINE_PREFIX + ref_.id, path: "", width, height };
}

/* Several photos at once (a carousel), in one write: the rules allow one
   photo upload every few seconds, and a batch counts as one. Firestore takes
   up to 10 MiB in a write, so each photo gets a tenth of that at most. */
export async function storeInlineImages(files, onProgress) {
  const budget = Math.min(MAX_DATA_CHARS * 0.85, 9_000_000 / Math.max(1, files.length));
  const done = [];
  for (const file of files) {
    done.push(await compressImage(file, { budget }));
    onProgress?.(Math.round((done.length / files.length) * 80));
  }
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  const refs = done.map((img) => {
    const ref_ = doc(collection(db, "media"));
    batch.set(ref_, { ownerId: uid, kind: "image", data: img.data, width: img.width, height: img.height, createdAt: serverTimestamp() });
    return ref_;
  });
  batch.set(doc(db, "rateLimits", uid), { media: serverTimestamp() }, { merge: true });
  try { await batch.commit(); }
  catch (err) {
    if (err?.code === "permission-denied") throw new Error("You're uploading photos very quickly. Wait a few seconds and try again.");
    throw err;
  }
  onProgress?.(100);
  return refs.map((r, i) => ({ url: INLINE_PREFIX + r.id, path: "", width: done[i].width, height: done[i].height }));
}

/** A photo's size in pixels, read in the browser. */
export async function imageSize(file) {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** Store a photo inside its conversation, readable only by its members. */
export async function storeChatPhoto(chatId, file) {
  const { data, width, height } = await compressImage(file);
  const ref_ = await addDoc(collection(db, "chats", chatId, "media"), {
    ownerId: auth.currentUser.uid,
    kind: "image",
    data,
    width,
    height,
    createdAt: serverTimestamp(),
  });
  return { mediaId: ref_.id, width, height };
}

/** A conversation's photo, as something an <img> can show. */
export function useChatMedia(chatId, mediaId) {
  const [loaded, setLoaded] = useState({ id: null, src: "" });
  useEffect(() => {
    let alive = true;
    if (!chatId || !mediaId) return;
    fetchInline(INLINE_PREFIX + mediaId, chatId).then((d) => { if (alive) setLoaded({ id: mediaId, src: d || "" }); }).catch(() => {});
    return () => { alive = false; };
  }, [chatId, mediaId]);
  return loaded.id === mediaId ? loaded.src : "";
}

/** Store a voice note inside its conversation, readable only by its members. */
export async function storeVoiceNote(chatId, blob, duration) {
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  if (data.length > MAX_DATA_CHARS) throw new Error("That voice note is too long. Keep it under a minute.");
  const ref_ = await addDoc(collection(db, "chats", chatId, "media"), {
    ownerId: auth.currentUser.uid,
    kind: "audio",
    data,
    duration,
    createdAt: serverTimestamp(),
  });
  return ref_.id;
}

export function fetchInline(url, chatId) {
  const id = url.slice(INLINE_PREFIX.length);
  const key = chatId ? `${chatId}/${id}` : id;
  if (!cache.has(key)) {
    const ref_ = chatId ? doc(db, "chats", chatId, "media", id) : doc(db, "media", id);
    const p = getDoc(ref_).then((s) => (s.exists() ? s.data().data : null));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/* <img src={useMediaSrc(post.mediaUrl)} />. Storage and GIPHY URLs pass
   straight through; inline media is fetched once and cached for the visit. */
export function useMediaSrc(url) {
  const [src, setSrc] = useState(isInline(url) ? "" : url || "");
  useEffect(() => {
    let alive = true;
    if (!isInline(url)) return;
    fetchInline(url).then((d) => { if (alive) setSrc(d || ""); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return isInline(url) ? src : url || "";
}
