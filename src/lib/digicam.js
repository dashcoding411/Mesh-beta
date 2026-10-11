// The Rolls look: a nostalgic camera, not a modern phone, and which one
// depends on the light. With the flash on it's an early-2000s compact with
// a xenon pop-up flash: more contrast, a lower black floor, punchy primaries
// and little warming. With it off it's warm 35mm film: a lifted black floor,
// soft highlight roll-off and gentle amber. Both undo what a phone's
// processing adds, and stay restrained so the photo survives:
// - a tiny blur (about 0.7 px) takes off the phone's edge sharpening;
// - a tone curve lifts the black floor while keeping deep shadows dense, adds
//   a little punch in the upper mid-tones, and rolls the top off to a soft
//   white instead of clipping;
// - split toning: gold highlights, slightly magenta shadows, a touch of
//   magenta overall;
// - colour like film and early CCDs: reds and oranges warmer (skin a little
//   brighter), yellows toward orange, greens toward olive and quieter, blues
//   toward cyan and quieter, muted colours lifted and loud ones calmed;
// - fine grain, the same on every channel, in soft clumps, strongest in the
//   mid-tones and fading in deep shadows and highlights;
// - the lens: a flash's fall-off (or a gentle vignette), a faint red-cyan
//   fringe toward the corners, and a faint warm halation round bright spots;
// - and the date stamp.
// Baked into the JPEG at capture, so it looks the same wherever it's shared.

export const OUTPUT_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.92;
export const STAMP_COLOR = "#ff9b2f";

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
  const xs = points.map((pt) => pt[0]);
  const ys = points.map((pt) => pt[1]);
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

// The two looks. Curves are (in, out) from 0 to 1.
const LOOKS = {
  // Flash: an early-2000s compact. Black at about 8, white at about 242.
  flash: {
    curve: monotoneCurve([[0, 0.03], [0.1, 0.075], [0.25, 0.22], [0.5, 0.5], [0.75, 0.795], [0.9, 0.905], [1, 0.95]]),
    warm: 0.01, sat: 1, vibrance: 0.18, greens: 0.88, blues: 0.88, falloff: [0.82, 0.2],
  },
  // No flash: warm 35mm film. Black at about 12, white at about 240.
  ambient: {
    curve: monotoneCurve([[0, 0.047], [0.1, 0.085], [0.25, 0.235], [0.5, 0.5], [0.75, 0.775], [0.9, 0.89], [1, 0.94]]),
    warm: 0.03, sat: 0.93, vibrance: 0.22, greens: 0.8, blues: 0.75, falloff: null,
  },
};
const lookFor = (flash) => (flash ? LOOKS.flash : LOOKS.ambient);

/**
 * Per-channel tone curves (0 to 255 in, 0 to 255 out): the look's curve
 * with gold highlights (less under flash), slightly magenta shadows and a
 * touch of magenta overall.
 */
export function digicamCurves({ flash = true } = {}) {
  const { curve, warm } = lookFor(flash);
  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const y = curve(i / 255);
    const shadow = Math.max(0, 1 - y * 2.2);
    const high = Math.max(0, y * 1.8 - 0.8);
    r[i] = Math.round(255 * clamp01(y + warm * high + 0.012 * shadow));
    g[i] = Math.round(255 * clamp01(y - 0.006 - 0.004 * shadow));
    b[i] = Math.round(255 * clamp01(y - warm * 1.3 * high + 0.02 * shadow));
  }
  return { r, g, b };
}

// How near a hue (degrees) is to `centre`: 1 there, easing to 0 at `width` away.
const near = (h, centre, width) => {
  const x = Math.abs(((h - centre + 540) % 360) - 180) / width;
  return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x);
};

// The look's colour, on one pixel (0 to 255 in `c`, changed in place), in
// hue, saturation and lightness.
function filmColour(c, look) {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  if (d < 0.004) return;
  let s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  const red = near(h, 0, 30);
  const orange = near(h, 30, 25);
  const yellow = near(h, 58, 25);
  const green = near(h, 115, 50);
  const blue = near(h, 220, 40);
  h += 5 * red - 10 * yellow - 12 * green - 15 * blue; // reds warmer, yellows toward orange, greens toward olive, blues toward cyan
  s *= look.sat * (1 + look.vibrance * (1 - s)) * (1 - (1 - look.greens) * green) * (1 - (1 - look.blues) * blue);
  if (s > 1) s = 1;
  l += 0.03 * orange * (1 - l); // skin a little brighter
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
 * Develops RGBA pixels in place. `soft` is the same image very slightly
 * blurred, to take off the phone's sharpening. `flash` picks the look (and
 * lights the middle with fall-off to the corners). The grain is seeded, so
 * the same photo develops the same way.
 */
export function gradePixels(px, soft, width, height, { flash = true, seed = 1 } = {}) {
  const look = lookFor(flash);
  const { r: R, g: G, b: B } = digicamCurves({ flash });
  const rand = rng(seed);
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy);
  const SOFTEN = 0.7;
  // Grain in soft clumps: a coarser random field (near-Gaussian), sampled
  // smoothly, plus a little fine texture on top.
  const CLUMP = 1.6;
  const gw = Math.ceil(width / CLUMP) + 2;
  const gh = Math.ceil(height / CLUMP) + 2;
  const field = new Float32Array(gw * gh);
  for (let i = 0; i < field.length; i++) field[i] = rand() + rand() + rand() - 1.5;
  const c = new Float32Array(3);
  for (let y = 0; y < height; y++) {
    const fy = y / CLUMP;
    const y0 = fy | 0;
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r0 = px[i] + SOFTEN * (soft[i] - px[i]);
      const g0 = px[i + 1] + SOFTEN * (soft[i + 1] - px[i + 1]);
      const b0 = px[i + 2] + SOFTEN * (soft[i + 2] - px[i + 2]);

      // Flash: a hard pop in the middle falling off to the corners. Without
      // it, a gentle lens vignette.
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const light = look.falloff
        ? look.falloff[0] + look.falloff[1] * Math.exp(-(d * d) / 0.28)
        : 1 - 0.18 * d * d;
      c[0] = r0 * light; c[1] = g0 * light; c[2] = b0 * light;

      filmColour(c, look);
      const r = R[c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0] | 0];
      const g = G[c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1] | 0];
      const b = B[c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2] | 0];

      // Grain: the same on all three channels, strongest in the mid-tones.
      const fx = x / CLUMP;
      const x0 = fx | 0;
      const tx = fx - x0;
      const k = y0 * gw + x0;
      const clump = (field[k] * (1 - tx) + field[k + 1] * tx) * (1 - ty) + (field[k + gw] * (1 - tx) + field[k + gw + 1] * tx) * ty;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const n = (clump * 0.85 + (rand() - 0.5) * 0.45) * 10 * (0.15 + 3.4 * lum * (1 - lum));
      px[i] = r + n;
      px[i + 1] = g + n;
      px[i + 2] = b + n;
    }
  }
  return px;
}

/**
 * The same RGBA pixels very slightly blurred (a 3x3 binomial kernel, about
 * 0.7 px), for taking off a phone's edge sharpening.
 */
export function softCopy(px, width, height) {
  const tmp = new Float32Array(px.length);
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = Math.max(0, x - 1);
      const r = Math.min(width - 1, x + 1);
      for (let ch = 0; ch < 3; ch++) {
        tmp[(y * width + x) * 4 + ch] = (px[(y * width + l) * 4 + ch] + 2 * px[(y * width + x) * 4 + ch] + px[(y * width + r) * 4 + ch]) / 4;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const u = Math.max(0, y - 1);
    const dn = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) out[i + ch] = (tmp[(u * width + x) * 4 + ch] + 2 * tmp[i + ch] + tmp[(dn * width + x) * 4 + ch]) / 4;
      out[i + 3] = px[i + 3];
    }
  }
  return out;
}

/**
 * An old lens's colour fringe, in place: red pushed outward and blue pulled
 * inward, by nothing in the middle and up to `most` pixels in the corners.
 */
export function lensFringe(px, width, height, most = 1) {
  const src = px.slice();
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxD = Math.hypot(cx, cy);
  const sample = (fx, fy, ch) => {
    const x0 = Math.max(0, Math.min(width - 2, fx | 0));
    const y0 = Math.max(0, Math.min(height - 2, fy | 0));
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const a = (y0 * width + x0) * 4 + ch;
    return (src[a] * (1 - tx) + src[a + 4] * tx) * (1 - ty) + (src[a + width * 4] * (1 - tx) + src[a + width * 4 + 4] * tx) * ty;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const k = (most * (dx * dx + dy * dy)) / (maxD * maxD * maxD);
      const i = (y * width + x) * 4;
      px[i] = sample(cx + dx * (1 - k), cy + dy * (1 - k), 0);
      px[i + 2] = sample(cx + dx * (1 + k), cy + dy * (1 + k), 2);
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

const STAMP_LEAN = 0.12; // forward lean, as a fraction of the height (about 7 degrees)

/**
 * The stamp's digits as polygons ([x, y, x, y, ...]), in a box `height` tall
 * from (0, 0) and `width` wide. Each segment is an LED's long hexagon, with
 * pointed ends and a hairline gap where segments meet, leaning forward.
 * `stroke` is the thinnest a segment may be, for tiny sizes on screen.
 * Shared by the stamp baked into photos and the camera's readouts
 * (components/rolls/SevenSeg.jsx).
 */
export function stampLayout(text, height, { stroke = 0 } = {}) {
  const h = height;
  const w = h * 0.5;
  const t = Math.max(stroke, h * 0.14);
  // The hairline gaps where segments meet; too small to see, they only break
  // the digits into dots, so tiny readouts go without.
  const g = h < 14 ? 0 : t * 0.22;
  const left = t / 2, right = w - t / 2, top = t / 2, mid = h / 2, bottom = h - t / 2;
  const across = (y, x1, x2) => [x1, y, x1 + t / 2, y - t / 2, x2 - t / 2, y - t / 2, x2, y, x2 - t / 2, y + t / 2, x1 + t / 2, y + t / 2];
  const down = (x, y1, y2) => [x, y1, x + t / 2, y1 + t / 2, x + t / 2, y2 - t / 2, x, y2, x - t / 2, y2 - t / 2, x - t / 2, y1 + t / 2];
  const segments = {
    a: across(top, left + g, right - g), g: across(mid, left + g, right - g), d: across(bottom, left + g, right - g),
    f: down(left, top + g, mid - g), b: down(right, top + g, mid - g),
    e: down(left, mid + g, bottom - g), c: down(right, mid + g, bottom - g),
  };
  const polys = [];
  let x = 0;
  let width = 0;
  const put = (pts) => {
    const p = pts.map((v, i) => (i % 2 ? v : x + v + (h - pts[i + 1]) * STAMP_LEAN));
    for (let i = 0; i < p.length; i += 2) width = Math.max(width, p[i]);
    polys.push(p);
  };
  for (const ch of text) {
    if (/\d/.test(ch)) {
      for (const s of segmentsFor(ch)) put(segments[s]);
      x += w + h * 0.22;
    } else if (ch === "'") {
      put(down(t / 2, t / 2, h * 0.3));
      x += t + h * 0.18;
    } else x += h * 0.3;
  }
  return { polys, width };
}

/** How wide a stamp `height` tall is. */
export const stampWidth = (text, height) => stampLayout(text, height).width;

/** A blur close to a Gaussian (three box passes), in place of canvas filters Safari lacks. */
function boxBlur(src, w, h, r) {
  const a = Float32Array.from(src);
  if (r < 1) return a;
  const b = new Float32Array(a.length);
  const k = 1 / (2 * r + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[row + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum * k;
        sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += b[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum * k;
        sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// Stamps already made, by text and size: the story editor redraws stickers
// as they're dragged.
const stampLights = new Map();

/**
 * The stamp as light, the way a film camera's date back printed it: LEDs
 * behind the film exposed the digits into it, so they're soft at the edge,
 * hottest in the middle, with a red-orange bleed round them and the film's
 * grain running through. Built a little larger or smaller than asked (sizes
 * step by about 12%) so sizes can share one.
 */
function stampLight(text, height) {
  const h = Math.max(8, Math.round(2 ** (Math.round(Math.log2(height) * 6) / 6)));
  const key = `${text}|${h}`;
  const known = stampLights.get(key);
  if (known) return known;

  const { polys, width } = stampLayout(text, h);
  const pad = Math.ceil(h * 0.6);
  const W = Math.ceil(width) + pad * 2;
  const H = h + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let seed = h;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
  const rand = rng(seed);
  ctx.fillStyle = "#fff";
  for (const p of polys) {
    // No two LEDs quite as bright as each other.
    ctx.globalAlpha = 0.84 + 0.16 * rand();
    ctx.beginPath();
    ctx.moveTo(pad + p[0], pad + p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(pad + p[i], pad + p[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const lit = new Float32Array(W * H);
  for (let i = 0; i < lit.length; i++) lit[i] = px[i * 4 + 3] / 255;
  const body = boxBlur(lit, W, H, Math.round(h * 0.028));
  const bleed = boxBlur(lit, W, H, Math.round(h * 0.2));
  for (let i = 0; i < lit.length; i++) {
    const s = body[i];
    const b = Math.min(1, bleed[i] * 1.6);
    const hot = s > 0.5 ? ((s - 0.5) / 0.5) ** 1.4 * 0.7 : 0;
    // Each colour as light, combined the way exposures add on film.
    const grain = 1 + (rand() + rand() + rand() - 1.5) * 0.3;
    const r = (1 - (1 - s) * (1 - hot) * (1 - b * 0.55)) * grain;
    const g = (1 - (1 - s * 0.6) * (1 - hot * 0.85) * (1 - b * 0.18)) * grain;
    const bl = (1 - (1 - s * 0.14) * (1 - hot * 0.55) * (1 - b * 0.04)) * grain;
    const a = Math.min(1, Math.max(r, g, bl));
    const j = i * 4;
    if (a <= 0.002) { px[j + 3] = 0; continue; }
    px[j] = (r / a) * 255;
    px[j + 1] = (g / a) * 255;
    px[j + 2] = (bl / a) * 255;
    px[j + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const light = { canvas, pad, width, h };
  stampLights.set(key, light);
  if (stampLights.size > 8) stampLights.delete(stampLights.keys().next().value);
  return light;
}

/**
 * Draws a date stamp `height` tall, right-aligned with its bottom at
 * (right, bottom). It's screened on, as light added to what's there: bright
 * over shadows, faint over a bright sky, like the real thing.
 */
export function drawStamp(ctx, text, right, bottom, height) {
  const { canvas, pad, width, h } = stampLight(text, height);
  const f = height / h;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, right - (pad + width) * f, bottom - (pad + h) * f, canvas.width * f, canvas.height * f);
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
 * Rolls JPEG Blob at up to 2048 px on the long side: the compact's look with
 * the flash on, film's without.
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

  const img = ctx.getImageData(0, 0, width, height);
  lensFringe(img.data, width, height, 1);
  gradePixels(img.data, softCopy(img.data, width, height), width, height, { flash, seed: date.getTime() % 100000 });
  ctx.putImageData(img, 0, 0);
  halation(ctx, canvas, flash ? 0.14 : 0.16);

  const stamp = Math.round(height * 0.045);
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
