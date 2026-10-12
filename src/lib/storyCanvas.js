// The story editor's drawing (components/story/StoryEditor.jsx). The same
// functions draw the live preview and the posted story, so what you see is
// what posts. Everything is laid out on a 9:16 frame in fractions of its
// width (sizes) and of its width and height (positions).

import { drawStamp } from "./digicam";
import { stampText, stampWidth, STAMP_COLOR } from "./stamp";

export const FRAME_W = 1080;
export const FRAME_H = 1920;
export const MAX_GIFS = 3;
export const PHOTO_SECONDS = [3, 5, 8, 10];

// Swipe left or right on a story to change these. `css` is CSS filter
// syntax: the preview uses it as is, and the export draws it with the
// canvas filter, or with the same maths where a browser has no canvas filter.
export const STORY_FILTERS = [
  { id: "none", name: "Original", css: "" },
  { id: "vivid", name: "Vivid", css: "contrast(1.08) saturate(1.35)" },
  { id: "warm", name: "Golden hour", css: "sepia(0.3) saturate(1.3) hue-rotate(-10deg) brightness(1.04)" },
  { id: "cool", name: "Cool", css: "saturate(0.85) hue-rotate(12deg) brightness(1.05) contrast(1.02)" },
  { id: "fade", name: "Faded", css: "contrast(0.82) saturate(0.75) brightness(1.1)" },
  { id: "dream", name: "Dreamy", css: "brightness(1.08) saturate(1.2) contrast(0.88) hue-rotate(-8deg)", vignette: 0.2 },
  { id: "mono", name: "Mono", css: "grayscale(1) contrast(1.08)" },
  { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.92)", vignette: 0.55 },
];
export const filterById = (id) => STORY_FILTERS.find((f) => f.id === id) || STORY_FILTERS[0];

/** CSS for a filter's vignette, matching drawVignette. */
export const vignetteCss = (v) => (v ? `radial-gradient(ellipse farthest-corner at center, transparent 55%, rgba(0,0,0,${v}) 100%)` : "none");

// Text styles, cycled with the Aa button, like Snapchat's.
export const TEXT_STYLES = [
  { id: "caption", name: "Caption" }, // the full-width bar
  { id: "big", name: "Big" },
  { id: "label", name: "Label" },
  { id: "glow", name: "Glow" },
];
export const CAPTION_SIZE = 0.042;
const DISPLAY = '"Plus Jakarta Sans Variable", "Inter Variable", system-ui, sans-serif';
const BODY = '"Inter Variable", system-ui, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const fontFor = (style, px) => (style === "caption" ? `600 ${px}px ${BODY}` : `800 ${px}px ${DISPLAY}`);

/** The colour slider: white at the top, the rainbow, black at the bottom. `t` runs 0 to 1. */
export function colorAt(t) {
  const v = Math.max(0, Math.min(1, t));
  if (v < 0.05) return "#ffffff";
  if (v > 0.95) return "#000000";
  const hue = Math.round(((v - 0.05) / 0.9) * 330);
  return `hsl(${hue} 95% 55%)`;
}
export const SLIDER_GRADIENT = "linear-gradient(to bottom, #fff 0%, #fff 5%, hsl(0 95% 55%) 5%, hsl(55 95% 55%) 21.7%, hsl(110 95% 55%) 38.3%, hsl(165 95% 55%) 55%, hsl(220 95% 55%) 71.7%, hsl(275 95% 55%) 88.3%, hsl(330 95% 55%) 95%, #000 95%, #000 100%)";

let parser = null;
/** Relative luminance (0 to 1) of a CSS colour the canvas understands. */
export function lightness(color) {
  parser ||= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  const c = parser;
  if (!c) return 1;
  c.fillStyle = color;
  const hex = c.fillStyle; // normalised to #rrggbb
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Lines for `text` at the context's current font, wrapped to `maxWidth`. */
export function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= maxWidth) { line = next; continue; }
      out.push(line);
      line = word;
    }
    out.push(line);
  }
  return out;
}

// Filters without a canvas filter (older Safari): the CSS filter functions,
// done per pixel in sRGB with the matrices from the Filter Effects spec.
const MATRICES = {
  saturate: (s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  grayscale: (a) => { const g = 1 - Math.min(1, a); return [0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g, 0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g, 0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g]; },
  sepia: (a) => { const g = 1 - Math.min(1, a); return [0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g, 0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g, 0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g]; },
  "hue-rotate": (deg) => {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
  },
};

/** "contrast(1.1) saturate(1.3)" as [["contrast", 1.1], ["saturate", 1.3]]. */
export function parseFilter(css) {
  return [...String(css).matchAll(/([a-z-]+)\(\s*(-?[\d.]+)(deg)?\s*\)/g)].map((m) => [m[1], Number(m[2])]);
}

/** Applies a CSS filter string to RGBA pixels in place. */
export function filterPixels(px, css) {
  const ops = parseFilter(css);
  if (!ops.length) return px;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255;
    let g = px[i + 1] / 255;
    let b = px[i + 2] / 255;
    for (const [name, v] of ops) {
      if (name === "brightness") { r = clamp(r * v); g = clamp(g * v); b = clamp(b * v); continue; }
      if (name === "contrast") { r = clamp((r - 0.5) * v + 0.5); g = clamp((g - 0.5) * v + 0.5); b = clamp((b - 0.5) * v + 0.5); continue; }
      const m = MATRICES[name]?.(v);
      if (!m) continue;
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = clamp(nr); g = clamp(ng); b = clamp(nb);
    }
    px[i] = Math.round(r * 255);
    px[i + 1] = Math.round(g * 255);
    px[i + 2] = Math.round(b * 255);
  }
  return px;
}

let canvasFilter = null;
function hasCanvasFilter() {
  if (canvasFilter !== null) return canvasFilter;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || typeof ctx.filter !== "string") return (canvasFilter = false);
  ctx.filter = "grayscale(1)";
  return (canvasFilter = ctx.filter === "grayscale(1)");
}

/**
 * The photo on the frame: filling it (`cover`), or whole (`contain`) over a
 * soft blurred copy of itself, like a phone shows a landscape photo in a story.
 */
export function drawPhoto(ctx, W, H, img, fit) {
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  if (!iw || !ih) return;
  const place = (s) => { const w = iw * s; const h = ih * s; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); };
  ctx.save();
  if (fit === "contain") {
    // A tiny copy, scaled up twice with smoothing, is a blur every browser can draw.
    const tiny = document.createElement("canvas");
    tiny.width = 18;
    tiny.height = 32;
    const t = tiny.getContext("2d");
    const s = Math.max(18 / iw, 32 / ih);
    t.drawImage(img, (18 - iw * s) / 2, (32 - ih * s) / 2, iw * s, ih * s);
    const mid = document.createElement("canvas");
    mid.width = 90;
    mid.height = 160;
    const m = mid.getContext("2d");
    m.imageSmoothingQuality = "high";
    m.drawImage(tiny, 0, 0, 90, 160);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mid, 0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);
    place(Math.min(W / iw, H / ih));
  } else {
    place(Math.max(W / iw, H / ih));
  }
  ctx.restore();
}

/** The filter, applied to everything drawn so far. */
export function applyFilter(ctx, W, H, filter) {
  const f = filterById(filter);
  if (f.css) {
    if (hasCanvasFilter()) {
      const copy = document.createElement("canvas");
      copy.width = W;
      copy.height = H;
      copy.getContext("2d").drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.filter = f.css;
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
    } else {
      const data = ctx.getImageData(0, 0, W, H);
      filterPixels(data.data, f.css);
      ctx.putImageData(data, 0, 0);
    }
  }
  if (f.vignette) drawVignette(ctx, W, H, f.vignette);
}

// Same as vignetteCss: an ellipse through the corners, clear to 55%.
export function drawVignette(ctx, W, H, v) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  const r = (W / 2) * Math.SQRT2;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0.55, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.fillStyle = g;
  // The frame, in this squashed space, is W by W.
  ctx.fillRect(-W / 2, -W / 2, W, W);
  ctx.restore();
}

// Strokes: { color, width (of W), points: [[x, y], …] in frame fractions }.
export function drawStrokes(ctx, W, H, strokes) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * W;
    const [x0, y0] = s.points[0];
    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(x0 * W, y0 * H, (s.width * W) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x0 * W, y0 * H);
    // Smooth through the midpoints.
    for (let i = 1; i < s.points.length - 1; i++) {
      const [x, y] = s.points[i];
      const [nx, ny] = s.points[i + 1];
      ctx.quadraticCurveTo(x * W, y * H, ((x + nx) / 2) * W, ((y + ny) / 2) * H);
    }
    const [lx, ly] = s.points[s.points.length - 1];
    ctx.lineTo(lx * W, ly * H);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Draws one layer (text, emoji or info sticker; GIFs stay animated, so the
 * viewer shows them over the story instead) and returns its box in frame
 * pixels, unrotated: { w, h }.
 */
export function drawLayer(ctx, W, H, layer) {
  const cx = layer.x * W;
  const cy = layer.y * H;
  ctx.save();
  ctx.translate(cx, cy);
  if (layer.type !== "text" || layer.style !== "caption") ctx.rotate(layer.rot || 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let box = { w: 0, h: 0 };

  if (layer.type === "text") {
    const caption = layer.style === "caption";
    const px = (caption ? CAPTION_SIZE : layer.size) * W;
    ctx.font = fontFor(layer.style, px);
    const lines = wrapLines(ctx, layer.text, (caption ? 0.9 : 0.86) * W);
    const lineH = px * (caption ? 1.3 : 1.15);
    const top = -((lines.length - 1) * lineH) / 2;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), px);
    if (caption) {
      const h = lines.length * lineH + px * 0.7;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(-cx, -h / 2, W, h);
      box = { w: W, h };
    } else {
      box = { w: widest + px * (layer.style === "label" ? 0.9 : 0.4), h: lines.length * lineH + px * 0.3 };
    }
    const light = lightness(layer.color) > 0.45;
    lines.forEach((line, i) => {
      const y = top + i * lineH;
      if (layer.style === "label" && line) {
        const w = ctx.measureText(line).width + px * 0.7;
        ctx.fillStyle = layer.color;
        roundRect(ctx, -w / 2, y - lineH / 2, w, lineH, lineH * 0.28);
        ctx.fill();
        ctx.fillStyle = light ? "#111114" : "#ffffff";
        ctx.fillText(line, 0, y);
      } else if (layer.style === "glow") {
        ctx.shadowColor = layer.color;
        ctx.shadowBlur = px * 0.55;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line, 0, y);
        ctx.shadowBlur = px * 0.25;
        ctx.fillStyle = light ? layer.color : "#ffffff";
        ctx.globalAlpha = 0.85;
        ctx.fillText(line, 0, y);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      } else {
        if (!caption) { ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = px * 0.18; }
        ctx.fillStyle = layer.color;
        ctx.fillText(line, 0, y);
        ctx.shadowBlur = 0;
      }
    });
  } else if (layer.type === "emoji") {
    const px = layer.size * W;
    ctx.font = `${px}px ${EMOJI}`;
    // Colour emoji take the fill's transparency, so it has to be opaque.
    ctx.fillStyle = "#000000";
    ctx.fillText(layer.char, 0, px * 0.06);
    box = { w: px * 1.2, h: px * 1.2 };
  } else if (layer.type === "info") {
    const px = layer.size * W;
    if (layer.kind === "stamp") {
      const w = stampWidth(layer.label, px);
      drawStamp(ctx, layer.label, w / 2, px / 2, px);
      box = { w: w + px * 0.4, h: px * 1.4 };
    } else {
      ctx.font = `800 ${px}px ${DISPLAY}`;
      const w = ctx.measureText(layer.label).width + px * 0.9;
      const h = px * 1.45;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3);
      ctx.fill();
      ctx.fillStyle = "#111114";
      ctx.fillText(layer.label, 0, px * 0.04);
      box = { w, h };
    }
  }
  ctx.restore();
  return box;
}

/** Sticker labels, worked out when the sticker is added. */
export function infoLabel(kind, date = new Date()) {
  if (kind === "time") return date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ").toLowerCase();
  if (kind === "date") return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  return stampText(date);
}
export { STAMP_COLOR };

/** Everything but GIFs and the photo: strokes under the layers, in order. */
export function drawOverlay(ctx, W, H, { strokes, layers }) {
  drawStrokes(ctx, W, H, strokes);
  for (const l of layers) if (l.type !== "gif") drawLayer(ctx, W, H, l);
}

/** Waits for the fonts the layers use, so text measures the same in the export. */
export async function fontsReady(layers) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const styles = new Set(layers.filter((l) => l.type === "text").map((l) => l.style));
  styles.add("big");
  await Promise.all([...styles].map((s) => document.fonts.load(fontFor(s, 40), "Ag").catch(() => {})));
}
