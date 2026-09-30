

export const CITE = /\[(\d{1,2})\]/g;

const stripCites = (t) => String(t || "").replace(/\s?\[\d{1,2}\]/g, "");

export const readMinutes = (t) => Math.max(1, Math.round(String(t || "").split(/\s+/).filter(Boolean).length / 220));

export const summaryOf = (n) => n.standfirst || n.keyPoints?.[0] || stripCites(n.script).slice(0, 240);

export const storyUrl = (id) => `${window.location.origin}/news/${encodeURIComponent(id)}`;

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
