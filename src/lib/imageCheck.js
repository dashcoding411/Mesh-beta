// Automatic image moderation. Nudity, pornography and sexually suggestive
// images aren't allowed anywhere on Mesh. There's no server to scan uploads
// (Spark plan), so images are checked on the device before they upload, with
// NSFWJS (MobileNetV2), loaded only once someone picks an image. Admins can
// also sweep recent posts for anything that got past it (Moderation).
// AI-generated pictures and videos are turned away here too (lib/aiMarkers).
import { aiMarker } from "./aiMarkers";

export const UNSAFE_PHOTO = "This photo can't be posted. Mesh doesn't allow nudity or sexual images.";
export const UNSAFE_VIDEO = "This video can't be posted. Mesh doesn't allow nudity or sexual content.";
export const CHECK_FAILED = "Couldn't check this image. Check your connection and try again.";
export const AI_GENERATED = "This looks AI-generated: its file says an AI tool made it. Mesh doesn't allow AI-generated pictures or videos. Editing your own photo with AI is fine.";

export class UnsafeImageError extends Error {
  constructor(message = UNSAFE_PHOTO) {
    super(message);
    this.name = "UnsafeImageError";
  }
}

/** The message to show for an upload that failed, or `fallback`. */
export const uploadProblem = (err, fallback) => (err?.name === "UnsafeImageError" ? err.message : fallback);

/**
 * "explicit" (nudity, porn, explicit drawings), "suggestive" (sexual
 * posing), or "ok", from NSFWJS class probabilities. Swimwear and beach
 * photos usually sit below the suggestive line.
 */
export function verdictOf(predictions) {
  const p = Object.fromEntries((predictions || []).map(({ className, probability }) => [className, probability]));
  const explicit = (p.Porn || 0) + (p.Hentai || 0);
  const sexy = p.Sexy || 0;
  if (explicit >= 0.5) return "explicit";
  if (sexy >= 0.8 || explicit + sexy >= 0.85) return "suggestive";
  return "ok";
}

let modelOnce = null;
function model() {
  modelOnce ||= (async () => {
    const [tf, { load }, { MobileNetV2MidModel }] = await Promise.all([
      import("@tensorflow/tfjs"),
      import("nsfwjs/core"),
      import("nsfwjs/models/mobilenet_v2_mid"),
    ]);
    tf.enableProdMode();
    return load("MobileNetV2Mid", { modelDefinitions: [MobileNetV2MidModel] });
  })();
  modelOnce.catch(() => { modelOnce = null; });
  return modelOnce;
}

/** Start loading the model ahead of a check (e.g. when a picker opens). */
export function warmUp() {
  model().catch(() => {});
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = src;
  });
}

/** How sure the classifier is that an image is explicit (porn or explicit drawing), 0 to 1. */
export function explicitScore(predictions) {
  return (predictions || []).reduce((sum, { className, probability }) =>
    (className === "Porn" || className === "Hentai" ? sum + probability : sum), 0);
}

/** Class probabilities for an image element, canvas or URL (object, data or same-origin). */
export async function classify(source) {
  const net = await model();
  const el = typeof source === "string" ? await loadImage(source) : source;
  return net.classify(el);
}

/** Verdict for an image element, canvas or URL. */
export async function checkImage(source) {
  return verdictOf(await classify(source));
}

// A few frames across the clip; any one failing fails the video.
async function checkVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    const length = Number.isFinite(video.duration) ? video.duration : 0;
    const times = length > 3 ? [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => f * length) : [0];
    for (const t of times) {
      video.currentTime = t;
      if (t > 0) await new Promise((resolve) => { video.onseeked = resolve; });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const v = await checkImage(canvas);
      if (v !== "ok") return v;
    }
    return "ok";
  } finally {
    URL.revokeObjectURL(url);
  }
}

const checked = new WeakMap(); // File -> Promise<verdict>

/** Verdict for a picked file (image or video), checked once per file. */
export function checkFile(file) {
  if (!checked.has(file)) {
    const run = file.type.startsWith("video/") ? checkVideo(file)
      : (async () => {
        const url = URL.createObjectURL(file);
        try { return await checkImage(url); } finally { URL.revokeObjectURL(url); }
      })();
    run.catch(() => checked.delete(file));
    checked.set(file, run);
  }
  return checked.get(file);
}

/**
 * Throws UnsafeImageError for nudity or sexual content. If the check itself
 * can't run, the upload stops too: it isn't let through unchecked.
 */
export async function assertSafe(file) {
  if (!file?.type || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return;
  // Generated from scratch is out; AI edits are labelled by the composer.
  if (await aiMarker(file) === "generated") throw new UnsafeImageError(AI_GENERATED);
  let verdict;
  try { verdict = await checkFile(file); } catch { throw new UnsafeImageError(CHECK_FAILED); }
  if (verdict !== "ok") throw new UnsafeImageError(file.type.startsWith("video/") ? UNSAFE_VIDEO : UNSAFE_PHOTO);
}
