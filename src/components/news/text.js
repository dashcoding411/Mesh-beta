

export const CITE = /\[(\d{1,2})\]/g;

const stripCites = (t) => String(t || "").replace(/\s?\[\d{1,2}\]/g, "");

export const readMinutes = (t) => Math.max(1, Math.round(String(t || "").split(/\s+/).filter(Boolean).length / 220));

export const isVideoStory = (s) => s?.format === "video" && !!s.videoUrl;

export const summaryOf = (n) => n.standfirst || n.keyPoints?.[0] || stripCites(n.script).slice(0, 240);

/** A story's 60-second version: the journalist's three points, or its summary for older stories. */
export function quickPoints(story) {
  const points = (story.keyPoints || []).filter(Boolean);
  return points.length ? points : [summaryOf(story)];
}

/** Minutes to read the 60-second versions of `stories`, at 240 words a minute. */
export function quickMinutes(stories) {
  const words = stories.reduce((n, s) => n + `${s.title} ${quickPoints(s).join(" ")}`.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 240));
}

export const storyUrl = (id) => `${window.location.origin}/news/${encodeURIComponent(id)}`;

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
