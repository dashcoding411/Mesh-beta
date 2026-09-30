// GIPHY search. Requires VITE_GIPHY_API_KEY; without it GIF entry points are
// hidden. Search terms and IPs go to GIPHY (disclosed in the privacy policy),
// and the picker must show GIPHY attribution.

import { assessText } from "./moderation";

const KEY = import.meta.env.VITE_GIPHY_API_KEY;
export const gifsEnabled = !!KEY;

function shape(g) {
  const img = g.images?.fixed_width || g.images?.downsized;
  return img ? { id: g.id, url: img.url.split("?")[0], width: Number(img.width), height: Number(img.height), title: (g.title || "").slice(0, 100) } : null;
}

export async function searchGifs(q, { minor = false, offset = 0 } = {}) {
  if (!KEY) return [];
  // Blocked queries return nothing.
  if (q.trim() && assessText(q).level !== "ok") return [];
  const rating = minor ? "g" : "pg-13";
  const path = q.trim() ? "search" : "trending";
  const params = new URLSearchParams({ api_key: KEY, limit: "24", offset: String(offset), rating, bundle: "messaging_non_clips" });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`https://api.giphy.com/v1/gifs/${path}?${params}`);
  if (!res.ok) throw new Error("GIF search isn't available right now.");
  const json = await res.json();
  // Titles are user-supplied; filter them too.
  return (json.data || []).map(shape).filter((g) => g && assessText(g.title).level !== "block");
}
