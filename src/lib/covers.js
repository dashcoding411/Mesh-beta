// Circle cover ids are legacy gradient class strings (also whitelisted in the
// rules); each maps to a flat colour with the lattice pattern.

const COVERS = {
  "from-violet-600 via-fuchsia-600 to-rose-500": "bg-violet-700",
  "from-sky-600 via-cyan-500 to-emerald-500": "bg-sky-700",
  "from-amber-500 via-orange-500 to-rose-500": "bg-amber-700",
  "from-emerald-600 via-teal-500 to-sky-500": "bg-emerald-700",
  "from-indigo-600 via-purple-600 to-pink-500": "bg-indigo-700",
};

export const coverClass = (id) => COVERS[id] || "bg-violet-700";

export const LATTICE = {
  backgroundImage:
    "linear-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.08) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};

/** "Melbourne Night Runners" -> "MN". */
export function initialsOf(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
