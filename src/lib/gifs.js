// GIF search through GIPHY.
//
// GIFs come from GIPHY, a third party: when someone opens the GIF picker,
// their search terms and IP address go to GIPHY (disclosed in the Privacy
// Policy). GIPHY licenses the GIFs for this use under its API terms, and
// requires the "Powered by GIPHY" mark, which the picker shows.
//
// To switch GIFs on, get a free API key at developers.giphy.com and put it in
// .env.local as VITE_GIPHY_API_KEY, then rebuild. Without a key, GIF buttons
// simply don't appear.

import { assessText } from "./moderation";

const KEY = import.meta.env.VITE_GIPHY_API_KEY;
export const gifsEnabled = !!KEY;

function shape(g) {
  const img = g.images?.fixed_width || g.images?.downsized;
  return img ? { id: g.id, url: img.url.split("?")[0], width: Number(img.width), height: Number(img.height), title: (g.title || "").slice(0, 100) } : null;
}

/* Under-16 accounts only ever get G-rated results. */
export async function searchGifs(q, { minor = false, offset = 0 } = {}) {
  if (!KEY) return [];
  // The same rules as posting: a search for a slur or an attack on a group
  // returns nothing, rather than a page of GIFs for it.
  if (q.trim() && assessText(q).level !== "ok") return [];
  const rating = minor ? "g" : "pg-13";
  const path = q.trim() ? "search" : "trending";
  const params = new URLSearchParams({ api_key: KEY, limit: "24", offset: String(offset), rating, bundle: "messaging_non_clips" });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`https://api.giphy.com/v1/gifs/${path}?${params}`);
  if (!res.ok) throw new Error("GIF search isn't available right now.");
  const json = await res.json();
  // GIF titles are written by uploaders; drop any that fail the same check.
  return (json.data || []).map(shape).filter((g) => g && assessText(g.title).level !== "block");
}
