// Inline media for the Spark plan (no Cloud Storage): images are compressed
// client-side to fit a Firestore document and referenced as `mesh-media:<id>`;
// voice notes are stored the same way inside their chat. Video still needs
// Storage.

import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../firebase";

export const INLINE_PREFIX = "mesh-media:";
const MAX_DATA_CHARS = 900_000; // base64 chars; also enforced by the rules
const cache = new Map(); // id -> Promise<string>, the data URL
const objectUrls = new Map(); // id -> Promise<string>, a blob: URL for display
const ready = new Map(); // id -> blob: URL once loaded, so a remount shows it at once

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

/** Downscales and steps down quality until the data URL fits `budget`. WebP where supported. */
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

/** Resolves to { url: "mesh-media:<id>", path, width, height }. */
export async function storeInlineImage(file, { maxSide } = {}) {
  const { data, width, height } = await compressImage(file, maxSide ? { maxSide } : undefined);
  // The rules require the media rate-limit stamp in the same batch.
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

// One batch for a whole carousel: a single rate-limit window, and the budget
// is split to stay under Firestore's 10 MiB request limit.
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

export async function imageSize(file) {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** Stored under the chat so only members can read it. */
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

export function useChatMedia(chatId, mediaId) {
  const url = mediaId ? INLINE_PREFIX + mediaId : "";
  const [loaded, setLoaded] = useState({ id: null, src: "" });
  useEffect(() => {
    let alive = true;
    if (!chatId || !mediaId || ready.has(keyOf(url, chatId))) return;
    inlineSrc(url, chatId).then((s) => { if (alive) setLoaded({ id: mediaId, src: s || "" }); }).catch(() => {});
    return () => { alive = false; };
  }, [chatId, mediaId, url]);
  if (!chatId || !mediaId) return "";
  return ready.get(keyOf(url, chatId)) || (loaded.id === mediaId ? loaded.src : "");
}

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

const keyOf = (url, chatId) => {
  const id = url.slice(INLINE_PREFIX.length);
  return chatId ? `${chatId}/${id}` : id;
};

export function fetchInline(url, chatId) {
  const id = url.slice(INLINE_PREFIX.length);
  const key = keyOf(url, chatId);
  if (!cache.has(key)) {
    const ref_ = chatId ? doc(db, "chats", chatId, "media", id) : doc(db, "media", id);
    const p = getDoc(ref_).then((s) => (s.exists() ? s.data().data : null));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

// A data URL as a blob: URL. Safari in particular is slow with images whose
// src is a long data URL (each is a string of up to a megabyte, parsed and
// held in memory), and fast with blob: URLs, which load like a file.
function toObjectUrl(data) {
  const comma = data.indexOf(",");
  const head = data.slice(0, comma);
  if (!head.startsWith("data:") || !head.endsWith(";base64")) return data;
  try {
    const bin = atob(data.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: head.slice(5, -7) }));
  } catch {
    return data;
  }
}

/** A `mesh-media:` image as a blob: URL to show, cached per session. */
export function inlineSrc(url, chatId) {
  const key = keyOf(url, chatId);
  if (!objectUrls.has(key)) {
    const p = fetchInline(url, chatId).then((data) => {
      // Only the binary copy is kept; a download or share fetches the data again.
      cache.delete(key);
      if (!data) return null;
      const src = toObjectUrl(data);
      ready.set(key, src);
      return src;
    });
    p.catch(() => objectUrls.delete(key));
    objectUrls.set(key, p);
  }
  return objectUrls.get(key);
}

/** Resolves `mesh-media:` URLs (cached per session); other URLs pass through. */
export function useMediaSrc(url) {
  const inline = isInline(url);
  const [loaded, setLoaded] = useState({ url: null, src: "" });
  useEffect(() => {
    let alive = true;
    if (!inline || ready.has(keyOf(url))) return;
    inlineSrc(url).then((s) => { if (alive) setLoaded({ url, src: s || "" }); }).catch(() => {});
    return () => { alive = false; };
  }, [url, inline]);
  if (!inline) return url || "";
  return ready.get(keyOf(url)) || (loaded.url === url ? loaded.src : "");
}
