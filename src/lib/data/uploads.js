// Media uploads: Cloud Storage when enabled, otherwise images inline in
// Firestore. Until Storage is on, videos and their posters can go to the
// Cloudflare media Worker instead (cloudflare/media, set VITE_MEDIA_API).
import { auth, loadStorage } from "../../firebase";
import { imageSize, storeInlineImage, storeInlineImages } from "../media";
import { assertSafe } from "../imageCheck";
import { me } from "./core.js";

// No Storage bucket (Spark plan).
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Media uploads aren't enabled yet. Cloud Storage needs the Firebase Blaze plan. " +
        "Strands work fine in the meantime."
    );
    this.name = "StorageUnavailableError";
  }
}

let storageCheck = null;

const MEDIA_API = (import.meta.env.VITE_MEDIA_API || "").replace(/\/$/, "");
// Matches the Worker's 100 MB request limit.
export const MAX_CLOUD_BYTES = 100 * 1024 * 1024;

/** True for a file on the Cloudflare media Worker. */
export const isCloudMedia = (url) => !!MEDIA_API && typeof url === "string" && url.startsWith(`${MEDIA_API}/v/`);

/** Whether videos can be posted at all (Cloud Storage, or the Cloudflare Worker). */
export async function videoUploadsAvailable() {
  return !!MEDIA_API || storageAvailable();
}

export function storageAvailable() {
  if (import.meta.env.VITE_STORAGE !== "on") return Promise.resolve(false);
  if (storageCheck) return storageCheck;
  // A missing bucket can make the SDK retry instead of failing, hence the timeout.
  const probe = (async () => {
    try {
      const { getDownloadURL, ref, storage } = await loadStorage();
      await getDownloadURL(ref(storage, `uploads/${me()}/.probe`));
      return true;
    } catch (err) {
      // object-not-found means the bucket exists.
      return err?.code === "storage/object-not-found";
    }
  })();
  storageCheck = Promise.race([
    probe,
    new Promise((res) => setTimeout(() => res(false), 6000)),
  ]);
  return storageCheck;
}

function isBucketMissing(err) {
  const code = err?.code || "";
  return (
    code === "storage/unknown" ||
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/unauthorized"
  );
}

// Every image and video is checked on the device first (lib/imageCheck.js).
export async function uploadMedia(file, onProgress, folder = "uploads") {
  await assertSafe(file);
  const storage = await storageAvailable();
  if (!storage && MEDIA_API && (file.type.startsWith("video/") || folder === "posters")) {
    return uploadToCloud(file, onProgress);
  }
  if (!storage) {
    if (!file.type.startsWith("image/")) throw new StorageUnavailableError();
    onProgress?.(40);
    // Avatars render at 120px at most.
    const stored = await storeInlineImage(file, folder === "avatars" ? { maxSide: 480 } : {});
    onProgress?.(100);
    return stored;
  }
  return uploadToStorage(file, onProgress, folder);
}

export async function uploadPhotos(files, onProgress) {
  for (const file of files) await assertSafe(file);
  if (!(await storageAvailable())) return storeInlineImages(files, onProgress);
  const out = [];
  for (const [i, file] of files.entries()) {
    const size = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
    const stored = await uploadToStorage(file, (p) => onProgress?.(Math.round(((i + p / 100) / files.length) * 100)), "uploads");
    out.push({ ...stored, ...size });
  }
  return out;
}

// Its message is written for people, so the composer shows it as is.
export class UploadError extends Error {
  constructor(message) { super(message); this.name = "UploadError"; }
}

function uploadToCloud(file, onProgress) {
  if (file.size > MAX_CLOUD_BYTES) return Promise.reject(new UploadError("Videos can be up to 100 MB for now. Try a shorter clip."));
  return auth.currentUser?.getIdToken().then((token) => new Promise((resolve, reject) => {
    // XHR rather than fetch, for upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${MEDIA_API}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && isCloudMedia(body.url)) resolve({ url: body.url, path: body.path });
      else reject(new UploadError(body.error || "The upload didn't go through. Try again."));
    };
    xhr.onerror = () => reject(new UploadError("The upload didn't go through. Check your connection."));
    xhr.send(file);
  })) ?? Promise.reject(new UploadError("Sign in to upload."));
}

/** Account deletion: removes every file you uploaded to the Cloudflare Worker. Best effort. */
export async function deleteAllCloudMedia() {
  const uid = auth.currentUser?.uid;
  const token = await auth.currentUser?.getIdToken();
  if (!MEDIA_API || !uid || !token) return;
  await fetch(`${MEDIA_API}/v/${uid}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

/** Removes your own file from the Cloudflare Worker. Best effort. */
export async function deleteCloudMedia(url) {
  if (!isCloudMedia(url)) return;
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

async function uploadToStorage(file, onProgress, folder) {
  const { getDownloadURL, ref, storage, uploadBytesResumable } = await loadStorage();
  const uid = me();
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-80);
  const path = `${folder}/${uid}/${Date.now()}-${safeName}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(isBucketMissing(err) ? new StorageUnavailableError() : err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path });
      }
    );
  });
}
