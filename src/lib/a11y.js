// Alt text policy (WCAG 1.1.1): author alt wins; an adjacent caption makes
// the image decorative; otherwise fall back to an attribution.
export function mediaAlt(post) {
  const written = (post?.alt || "").trim();
  if (written) return written;
  if ((post?.text || "").trim()) return "";
  return `Photo shared by @${post?.authorName || "someone"}`;
}

export function storyAlt(item, authorName) {
  const written = (item?.alt || "").trim();
  const words = (item?.text || "").trim().replace(/\s+/g, " ");
  return written || `Story from @${authorName || "someone"}${words ? `, with the words: ${words}` : ""}`;
}
