// How a photo post is framed: the shape every photo in it is cut to, where
// each sits inside that frame, and its filter, baked into the file before
// upload so the post looks exactly as it did in the composer.
import { applyFilter } from "./storyCanvas";

export const SHAPES = [
  { id: "original", label: "Original" },
  { id: "portrait", label: "4:5", ratio: 1.25 },
  { id: "square", label: "1:1", ratio: 1 },
];
// The feed shows photos between 4:5 (tall) and 1.91:1 (wide); a carousel
// takes its shape from the first photo (components/post/PostMedia.jsx).
export const TALLEST = 1.25;
export const WIDEST = 1 / 1.91;
const BAKE_SIDE = 3072; // plenty: uploads are prepared at up to 2048 px

/** The frame's height over width for a shape, given the first photo's size. */
export function frameRatio(shape, w, h) {
  const s = SHAPES.find((x) => x.id === shape);
  if (s?.ratio) return s.ratio;
  if (!w || !h) return TALLEST;
  return Math.min(TALLEST, Math.max(WIDEST, h / w));
}

/**
 * The part of a `w` x `h` photo inside a frame of `ratio` (height over
 * width), placed by `x` and `y` (0 to 100: which end of the spare it keeps,
 * like CSS object-position). Whole pixels.
 */
export function cropRect(w, h, ratio, x = 50, y = 50) {
  if (h / w > ratio + 1e-3) {
    const ch = Math.round(w * ratio);
    return { x: 0, y: Math.round(((h - ch) * y) / 100), w, h: ch };
  }
  if (h / w < ratio - 1e-3) {
    const cw = Math.round(h / ratio);
    return { x: Math.round(((w - cw) * x) / 100), y: 0, w: cw, h };
  }
  return { x: 0, y: 0, w, h };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("That photo couldn't be read."));
  img.src = src;
});

/**
 * The photo as it'll be posted: cut to `ratio` where it sits (`entry.x`,
 * `entry.y`) with its filter. A photo that needs neither comes back as is.
 */
export async function bakePhoto(entry, ratio) {
  const img = await loadImage(entry.url);
  const crop = cropRect(img.naturalWidth, img.naturalHeight, ratio, entry.x, entry.y);
  const plain = crop.w === img.naturalWidth && crop.h === img.naturalHeight;
  if (plain && (!entry.filter || entry.filter === "none")) return entry.file;
  const scale = Math.min(1, BAKE_SIDE / Math.max(crop.w, crop.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.w * scale);
  canvas.height = Math.round(crop.h * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  if (entry.filter && entry.filter !== "none") applyFilter(ctx, canvas.width, canvas.height, entry.filter);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) return entry.file;
  return new File([blob], entry.file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
