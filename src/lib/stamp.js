// The date stamp's digits and text, shared by the stamp baked into roll
// photos (lib/digicam.js), the story sticker (lib/storyCanvas.js) and the
// on-screen readouts (components/rolls/SevenSeg.jsx). Kept apart from the
// develop code so pages that only draw digits don't load it.

export const STAMP_COLOR = "#ff9b2f";

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
