// The moderators' image sweep: everything is checked on the uploader's device
// (lib/imageCheck.js), but a modified app could skip that, and posts from
// before the check never had it. Admins' devices scan recent public posts;
// confidently explicit images are hidden at once, the rest listed for review.
import { fetchFeed, setPostHidden } from "./db";
import { fetchInline, isInline } from "./media";
import { classify, explicitScore, verdictOf } from "./imageCheck";

// Posts are only hidden without a moderator when the classifier is confident;
// anything over the upload line but under this waits for a decision.
const AUTO_HIDE = 0.7;

const SEEN_KEY = "mesh:image-sweep"; // url -> { verdict, score }, so each image is scanned once per device
const MAX_SEEN = 2000;

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}
function writeSeen(seen) {
  const entries = Object.entries(seen).slice(-MAX_SEEN);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* storage full or blocked */ }
}

/** The images in a post: photos, carousel slides and video posters. */
export function imagesOf(post) {
  const urls = [];
  if (post.kind === "post" && post.mediaUrl) urls.push(post.mediaUrl);
  for (const m of (post.media || []).slice(1)) if (m?.url) urls.push(m.url);
  if (post.posterUrl) urls.push(post.posterUrl);
  return [...new Set(urls)];
}

// Inline images are data URLs; Storage images can't be read into a canvas
// without CORS on the bucket, so they're left to reports.
async function sourceOf(url) {
  if (isInline(url)) return fetchInline(url);
  return null;
}

/**
 * Scans recent public posts. Resolves to the flagged ones:
 * [{ post, url, verdict, hidden }]. `onProgress(done, total)`.
 */
export async function sweepImages({ onProgress } = {}) {
  const posts = (await fetchFeed()).filter((p) => p.modStatus !== "cleared");
  const seen = readSeen();
  const jobs = posts.flatMap((post) => imagesOf(post).map((url) => ({ post, url })));
  const flagged = [];
  let done = 0;
  onProgress?.(0, jobs.length);
  for (const { post, url } of jobs) {
    let result = typeof seen[url] === "object" ? seen[url] : null;
    if (!result) {
      try {
        const src = await sourceOf(url);
        const preds = src ? await classify(src) : null;
        result = preds ? { verdict: verdictOf(preds), score: explicitScore(preds) } : { verdict: "skipped", score: 0 };
        seen[url] = result;
      } catch {
        result = { verdict: "error", score: 0 };
      }
    }
    const { verdict, score } = result;
    if (verdict === "explicit" || verdict === "suggestive") {
      let hidden = post.modStatus === "hidden";
      // Confidently explicit images come down straight away; a moderator decides the rest.
      if (score >= AUTO_HIDE && !hidden) hidden = await setPostHidden(post.id, true).then(() => true).catch(() => false);
      if (!flagged.some((f) => f.post.id === post.id)) flagged.push({ post, url, verdict, hidden });
    }
    onProgress?.(++done, jobs.length);
  }
  writeSeen(seen);
  return flagged;
}

/** Remembers a moderator's "not a problem" so the image isn't flagged again here. */
export function markImageOk(url) {
  const seen = readSeen();
  seen[url] = { verdict: "ok", score: 0 };
  writeSeen(seen);
}
