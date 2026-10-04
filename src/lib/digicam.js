// The Rolls look: a mid-2000s digital compact. Punchy colour with cool
// shadows and warm highlights, a direct-flash pop that falls off to the
// corners, crisp (slightly over-sharpened) edges, soft glow round the
// highlights, sensor grain and the orange date stamp. Baked into the JPEG at
// capture, so it looks the same everywhere it's shared.

export const OUTPUT_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.92;
export const STAMP_COLOR = "#ff9b2f";
export const STAMP_CORE = "#ffd7a1";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Small, fast, seedable random numbers, so a photo's grain is repeatable in tests. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-channel tone curves (0 to 255 in, 0 to 255 out): an S-curve with
 * highlights that clip a touch early, cool-green shadows and warm highlights.
 * With flash the white balance runs cooler and cleaner.
 */
export function digicamCurves({ flash = true } = {}) {
  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);
  // Flash runs cool and clean, like a compact's xenon flash; without it, warm.
  const warm = flash ? -0.02 : 0.05;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const s = x < 0.5 ? 0.5 * Math.pow(2 * x, 1.55) : 1 - 0.5 * Math.pow(2 * (1 - x), 1.55);
    const y = 0.018 + clamp01(s * 1.08) * 0.982;
    const shadow = Math.max(0, 1 - y * 2.2);
    const high = Math.max(0, y * 1.8 - 0.8);
    r[i] = Math.round(255 * clamp01(y + warm * high - 0.03 * shadow));
    g[i] = Math.round(255 * clamp01(y + 0.01 * high + 0.018 * shadow));
    b[i] = Math.round(255 * clamp01(y - (warm + 0.005) * high + 0.05 * shadow));
  }
  return { r, g, b };
}

/**
 * Grades RGBA pixels in place. `soft` is a blurred copy of the same image
 * (for sharpening). `flash` brightens the middle and falls off to the edges.
 */
export function gradePixels(px, soft, width, height, { flash = true, seed = 1 } = {}) {
  const { r: R, g: G, b: B } = digicamCurves({ flash });
  const rand = rng(seed);
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy);
  const sharpen = 0.7;
  const sat = 1.28;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Crunchy edges: original plus some of its difference from the blur.
      let r = px[i] + sharpen * (px[i] - soft[i]);
      let g = px[i + 1] + sharpen * (px[i + 1] - soft[i + 1]);
      let b = px[i + 2] + sharpen * (px[i + 2] - soft[i + 2]);

      // Flash pop and corner fall-off (a gentle vignette without flash).
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const light = flash ? 0.72 + 0.5 * Math.exp(-(d * d) / 0.3) : 1.05 - 0.26 * d * d;
      r *= light; g *= light; b *= light;

      r = R[r < 0 ? 0 : r > 255 ? 255 : r | 0];
      g = G[g < 0 ? 0 : g > 255 ? 255 : g | 0];
      b = B[b < 0 ? 0 : b > 255 ? 255 : b | 0];

      // A little extra colour.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;

      // Sensor grain, heavier in the shadows, with a hint of colour noise.
      const dark = 1 - lum / 255;
      const n = (rand() - 0.5) * (8 + 16 * dark);
      const c = (rand() - 0.5) * 7 * dark;
      px[i] = r + n + c;
      px[i + 1] = g + n;
      px[i + 2] = b + n - c;
    }
  }
  return px;
}

// Seven-segment digits for the date stamp: segments a to g.
const SEGMENTS = {
  0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};
export const segmentsFor = (digit) => SEGMENTS[digit] || "";

/** "05 10 '26": day, month, year, the way a compact printed it. */
export function stampText(date = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${two(date.getDate())} ${two(date.getMonth() + 1)} '${two(date.getFullYear() % 100)}`;
}

/** Draws a seven-segment stamp, right-aligned with its baseline at (right, bottom). */
export function drawStamp(ctx, text, right, bottom, height) {
  const w = height * 0.54;
  const t = Math.max(2.5, height * 0.15);
  const gap = height * 0.2;
  const slant = height * 0.08;
  const widthOf = (ch) => (ch === " " ? gap * 1.6 : ch === "'" ? t * 2.2 : w + gap);
  let x = right - [...text].reduce((s, ch) => s + widthOf(ch), 0);
  const top = bottom - height;
  const half = height / 2;
  // Segment rectangles relative to a digit's top-left, before the slant.
  const rects = {
    a: [t * 0.6, 0, w - t * 1.2, t], g: [t * 0.6, half - t / 2, w - t * 1.2, t], d: [t * 0.6, height - t, w - t * 1.2, t],
    f: [0, t * 0.6, t, half - t * 0.9], b: [w - t, t * 0.6, t, half - t * 0.9],
    e: [0, half + t * 0.3, t, half - t * 0.9], c: [w - t, half + t * 0.3, t, half - t * 0.9],
  };
  const shape = (rx, ry, rw, rh) => {
    // Lean the segment forward like an LCD.
    const k = slant / height;
    ctx.moveTo(rx + (height - ry) * k, top + ry);
    ctx.lineTo(rx + rw + (height - ry) * k, top + ry);
    ctx.lineTo(rx + rw + (height - ry - rh) * k, top + ry + rh);
    ctx.lineTo(rx + (height - ry - rh) * k, top + ry + rh);
    ctx.closePath();
  };
  const path = () => {
    ctx.beginPath();
    for (const ch of text) {
      if (/\d/.test(ch)) for (const s of segmentsFor(ch)) { const [rx, ry, rw, rh] = rects[s]; shape(x + rx, ry, rw, rh); }
      else if (ch === "'") shape(x + t * 0.6, 0, t * 0.9, height * 0.32);
      x += widthOf(ch);
    }
  };
  const start = x;
  ctx.save();
  // Glow, then a brighter core.
  ctx.shadowColor = STAMP_COLOR;
  ctx.shadowBlur = height * 0.55;
  ctx.fillStyle = STAMP_COLOR;
  path();
  ctx.fill();
  x = start;
  ctx.shadowBlur = height * 0.12;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = STAMP_CORE;
  path();
  ctx.fill();
  ctx.restore();
}

// Soft glow round the highlights: the bright parts, blurred by scaling down
// and back up, added on top.
function bloom(ctx, canvas, strength) {
  const w = Math.max(8, Math.round(canvas.width / 12));
  const h = Math.max(8, Math.round(canvas.height / 12));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const s = small.getContext("2d");
  s.imageSmoothingQuality = "high";
  s.drawImage(canvas, 0, 0, w, h);
  const img = s.getImageData(0, 0, w, h);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const k = Math.max(0, lum - 160) / 70;
    p[i] *= k; p[i + 1] *= k * 0.92; p[i + 2] *= k * 0.85;
  }
  s.putImageData(img, 0, 0);
  const mid = document.createElement("canvas");
  mid.width = Math.round(canvas.width / 4);
  mid.height = Math.round(canvas.height / 4);
  const m = mid.getContext("2d");
  m.imageSmoothingQuality = "high";
  m.drawImage(small, 0, 0, mid.width, mid.height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = strength;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Develops a frame (a <video> or <canvas>, cropped to `crop`) into a
 * digicam JPEG Blob at up to 2048 px on the long side.
 */
export async function developFrame(source, crop, { flash = true, mirrored = false, date = new Date() } = {}) {
  const scale = Math.min(1, OUTPUT_LONG_SIDE / Math.max(crop.w, crop.h));
  const width = Math.round(crop.w * scale);
  const height = Math.round(crop.h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // A gently blurred copy, for sharpening.
  const blur = document.createElement("canvas");
  blur.width = Math.max(1, Math.round(width / 2.5));
  blur.height = Math.max(1, Math.round(height / 2.5));
  const bctx = blur.getContext("2d");
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(canvas, 0, 0, blur.width, blur.height);
  const softCanvas = document.createElement("canvas");
  softCanvas.width = width;
  softCanvas.height = height;
  const sctx = softCanvas.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(blur, 0, 0, width, height);

  const img = ctx.getImageData(0, 0, width, height);
  const soft = sctx.getImageData(0, 0, width, height).data;
  gradePixels(img.data, soft, width, height, { flash, seed: date.getTime() % 100000 });
  ctx.putImageData(img, 0, 0);
  bloom(ctx, canvas, flash ? 0.55 : 0.45);

  const stamp = Math.round(height * 0.042);
  drawStamp(ctx, stampText(date), width - Math.round(width * 0.05), height - Math.round(height * 0.045), stamp);

  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't develop the photo"))), "image/jpeg", JPEG_QUALITY));
  return { blob, width, height };
}

/** The crop of a `vw` x `vh` frame that fills `aspect` (width / height), centred. */
export function centreCrop(vw, vh, aspect) {
  let w = vw;
  let h = vh;
  if (vw / vh > aspect) w = vh * aspect; else h = vw / aspect;
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w: Math.round(w), h: Math.round(h) };
}
