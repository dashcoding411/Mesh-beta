// The Rolls look: a 35mm disposable, not a modern phone. Film cushions
// what a phone's processing makes harsh, so the develop step:
// - softens rather than sharpens (phones over-sharpen edges);
// - fades the tones: matte, lifted blacks with a charcoal blue-green cast,
//   lower contrast, and highlights that roll off creamy instead of clipping;
// - warms the colour a little (golden highlights, a touch of magenta) and
//   tames it: greens lean teal and lose saturation, blues lose some, warm
//   tones lean orange for skin, and the loudest colours calm down most;
// - adds fine film grain, the same in every channel (no colour static),
//   in soft clumps rather than pixel noise, strongest in the mid-tones;
// - adds the faint red-orange halation film gets round bright spots, a
//   point-and-shoot flash's fall-off to the corners, and the date stamp.
// Baked into the JPEG at capture, so it looks the same wherever it's shared.

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

// A smooth curve through points that never dips (monotone cubic,
// Fritsch-Carlson), like dragging points on a photo editor's tone curve.
function monotoneCurve(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const k = a * a + b * b;
    if (k > 9) { const t = 3 / Math.sqrt(k); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// The fade: black lifted to a matte charcoal (about 18 of 255), mid-tones
// a little flatter than a phone's, and the top easing off to a creamy white
// (about 238) instead of clipping.
const FILM_CURVE = monotoneCurve([[0, 0.07], [0.2, 0.235], [0.5, 0.52], [0.8, 0.8], [0.92, 0.885], [1, 0.935]]);

/**
 * Per-channel tone curves (0 to 255 in, 0 to 255 out): the film fade, with
 * blue-green shadows, golden highlights and a touch of magenta. Under flash
 * the light runs cooler, so the highlights are less golden.
 */
export function digicamCurves({ flash = true } = {}) {
  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);
  const warm = flash ? 0.012 : 0.03;
  for (let i = 0; i < 256; i++) {
    const y = FILM_CURVE(i / 255);
    const shadow = Math.max(0, 1 - y * 2.2);
    const high = Math.max(0, y * 1.8 - 0.8);
    r[i] = Math.round(255 * clamp01(y + warm * high - 0.02 * shadow));
    g[i] = Math.round(255 * clamp01(y - 0.006 + 0.012 * shadow));
    b[i] = Math.round(255 * clamp01(y - warm * 1.2 * high + 0.035 * shadow));
  }
  return { r, g, b };
}

// How near a hue (degrees) is to `centre`: 1 there, easing to 0 at `width` away.
const near = (h, centre, width) => {
  const x = Math.abs(((h - centre + 540) % 360) - 180) / width;
  return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x);
};

// Film's colour, on one pixel (0 to 255 in `c`, changed in place): greens
// toward teal and quieter, blues quieter, warm tones toward orange, and the
// most saturated colours calmed the most.
function filmColour(c) {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.004) return;
  let s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  const green = near(h, 115, 55);
  const blue = near(h, 220, 40);
  const warm = near(h, 35, 30);
  h += 14 * green - 5 * warm;
  s *= (1 - 0.22 * green) * (1 - 0.16 * blue) * (1 - 0.14 * s);
  // Back to RGB.
  const q = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = q * (1 - Math.abs((hp % 2) - 1));
  const m = l - q / 2;
  const [r1, g1, b1] = hp < 1 ? [q, x, 0] : hp < 2 ? [x, q, 0] : hp < 3 ? [0, q, x] : hp < 4 ? [0, x, q] : hp < 5 ? [x, 0, q] : [q, 0, x];
  c[0] = (r1 + m) * 255;
  c[1] = (g1 + m) * 255;
  c[2] = (b1 + m) * 255;
}

/**
 * Develops RGBA pixels in place. `soft` is a blurred copy of the same image
 * (for softening). `flash` lights the middle a touch and falls off to the
 * corners. The grain is seeded, so the same photo develops the same way.
 */
export function gradePixels(px, soft, width, height, { flash = true, seed = 1 } = {}) {
  const { r: R, g: G, b: B } = digicamCurves({ flash });
  const rand = rng(seed);
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy);
  const SOFTEN = 0.16;
  // Grain in soft clumps: a coarser random field, sampled smoothly, plus a
  // little fine texture on top.
  const CLUMP = 1.7;
  const gw = Math.ceil(width / CLUMP) + 2;
  const gh = Math.ceil(height / CLUMP) + 2;
  const field = new Float32Array(gw * gh);
  for (let i = 0; i < field.length; i++) field[i] = rand() + rand() - 1;
  const c = new Float32Array(3);
  for (let y = 0; y < height; y++) {
    const fy = y / CLUMP;
    const y0 = fy | 0;
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Softer, as film is: a little of the blurred copy blended in.
      let r = px[i] + SOFTEN * (soft[i] - px[i]);
      let g = px[i + 1] + SOFTEN * (soft[i + 1] - px[i + 1]);
      let b = px[i + 2] + SOFTEN * (soft[i + 2] - px[i + 2]);

      // Flash in the middle and fall-off to the corners (a gentle lens
      // vignette without flash). The phone already exposed the frame, so
      // the middle only gets a nudge.
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const light = flash ? 0.88 + 0.14 * Math.exp(-(d * d) / 0.3) : 1.02 - 0.2 * d * d;
      c[0] = r * light; c[1] = g * light; c[2] = b * light;

      filmColour(c);
      r = R[c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0] | 0];
      g = G[c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1] | 0];
      b = B[c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2] | 0];

      // Grain: the same on all three channels, strongest in the mid-tones.
      const fx = x / CLUMP;
      const x0 = fx | 0;
      const tx = fx - x0;
      const k = y0 * gw + x0;
      const clump = (field[k] * (1 - tx) + field[k + 1] * tx) * (1 - ty) + (field[k + gw] * (1 - tx) + field[k + gw + 1] * tx) * ty;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const n = (clump * 0.8 + (rand() - 0.5) * 0.5) * 9 * (0.35 + 2.6 * lum * (1 - lum));
      px[i] = r + n;
      px[i + 1] = g + n;
      px[i + 2] = b + n;
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

// Halation: the faint red-orange glow film gets round bright spots, as light
// bounces back through it. Only the brightest parts, blurred by scaling down
// and back up, screened on (which can't push anything past white).
function halation(ctx, canvas, strength) {
  const w = Math.max(8, Math.round(canvas.width / 8));
  const h = Math.max(8, Math.round(canvas.height / 8));
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
    const k = Math.min(1, Math.max(0, lum - 205) / 50);
    p[i] *= k; p[i + 1] *= k * 0.55; p[i + 2] *= k * 0.35;
  }
  s.putImageData(img, 0, 0);
  const mid = document.createElement("canvas");
  mid.width = Math.round(canvas.width / 4);
  mid.height = Math.round(canvas.height / 4);
  const m = mid.getContext("2d");
  m.imageSmoothingQuality = "high";
  m.drawImage(small, 0, 0, mid.width, mid.height);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = strength;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Develops a frame (a <video> or <canvas>, cropped to `crop`) into a
 * film-look JPEG Blob at up to 2048 px on the long side.
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

  // A gently blurred copy, for softening.
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
  halation(ctx, canvas, flash ? 0.16 : 0.14);

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
