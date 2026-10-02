// Media uploads: Cloud Storage when enabled, otherwise images inline in Firestore.
import { loadStorage } from "../../firebase";
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
  if (!(await storageAvailable())) {
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
