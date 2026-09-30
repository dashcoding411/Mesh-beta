// Uploading photos and video: Cloud Storage when it's on, Firestore otherwise.
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../../firebase";
import { imageSize, storeInlineImage, storeInlineImages } from "../media";
import { me } from "./core.js";

// ---------- media upload ----------

// Thrown when the Firebase project has no Storage bucket provisioned, which
// happens on the free Spark plan: Cloud Storage requires the Blaze plan.
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Media uploads aren't enabled yet. Cloud Storage needs the Firebase Blaze plan. " +
        "Strands work fine in the meantime."
    );
    this.name = "StorageUnavailableError";
  }
}

// Probed once per session so the composer can tell the user *why* posting is
// blocked instead of failing at the end of a form.
let storageCheck = null;

export function storageAvailable() {
  // Cloud Storage needs the Blaze plan. Until VITE_STORAGE=on is set, don't
  // probe a bucket that doesn't exist from every visitor's browser.
  if (import.meta.env.VITE_STORAGE !== "on") return Promise.resolve(false);
  // One shared check: callers that arrive while it's running wait for it
  // rather than starting their own.
  if (storageCheck) return storageCheck;
  // A missing bucket can leave the SDK retrying instead of erroring, so the
  // probe races a timeout; an unanswered bucket is treated as unavailable.
  const probe = (async () => {
    try {
      await getDownloadURL(ref(storage, `uploads/${me()}/.probe`));
      return true;
    } catch (err) {
      // "object not found" means the bucket exists and answered: that's a pass.
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

/* Photos go to Cloud Storage when it's on, and into Firestore (compressed)
   when it isn't; video needs Storage either way. */
export async function uploadMedia(file, onProgress, folder = "uploads") {
  if (!(await storageAvailable())) {
    if (!file.type.startsWith("image/")) throw new StorageUnavailableError();
    onProgress?.(40);
    // Avatars show at 40 to 120px, so there's no point keeping a big one.
    const stored = await storeInlineImage(file, folder === "avatars" ? { maxSide: 480 } : {});
    onProgress?.(100);
    return stored;
  }
  return uploadToStorage(file, onProgress, folder);
}

/** A carousel's photos, in order, each with its size. */
export async function uploadPhotos(files, onProgress) {
  if (!(await storageAvailable())) return storeInlineImages(files, onProgress);
  const out = [];
  for (const [i, file] of files.entries()) {
    const size = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
    const stored = await uploadToStorage(file, (p) => onProgress?.(Math.round(((i + p / 100) / files.length) * 100)), "uploads");
    out.push({ ...stored, ...size });
  }
  return out;
}

function uploadToStorage(file, onProgress, folder) {
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
