// Backgrounds for short Strands (one line, up to 140 characters, no poll or
// GIF). The author picks one, or "none" for plain text. Each keeps white text
// above 7:1. Posts from before the picker get one from their id.
export const CARD_BACKGROUNDS = [
  { id: "violet", label: "Purple", className: "from-violet-700 to-fuchsia-800" },
  { id: "blue", label: "Blue", className: "from-blue-700 to-indigo-800" },
  { id: "teal", label: "Teal", className: "from-teal-700 to-cyan-900" },
  { id: "rose", label: "Pink", className: "from-rose-700 to-pink-900" },
  { id: "orange", label: "Orange", className: "from-orange-700 to-red-900" },
  { id: "slate", label: "Grey", className: "from-slate-700 to-slate-900" },
];
export const CARD_IDS = CARD_BACKGROUNDS.map((c) => c.id);
export const STRAND_CARD_MAX = 140;

/** Whether a Strand's text and extras allow a background. */
export const fitsCard = ({ text = "", poll, gif } = {}) =>
  !!text.trim() && text.length <= STRAND_CARD_MAX && !text.includes("\n") && !poll && !gif;

/** The gradient classes for a post, or null for plain text. */
export function cardClassFor(post) {
  if (post.card === "none") return null;
  const picked = CARD_BACKGROUNDS.find((c) => c.id === post.card);
  if (picked) return picked.className;
  const id = post.id || "";
  return CARD_BACKGROUNDS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CARD_BACKGROUNDS.length].className;
}
