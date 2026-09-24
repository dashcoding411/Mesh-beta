/* Alt text decisions live here so every surface that renders user media makes
   the same one.

   The rule we follow: an author-written description always wins. Failing that,
   a caption rendered next to the image already conveys the meaning, so the
   image is marked decorative — announcing the caption twice is worse than not
   announcing it at all. Only when there is neither do we fall back to a bare
   attribution, which at least tells a screen reader user what they've reached.

   See WCAG 2.2 SC 1.1.1 and the W3C alt decision tree. */
export function mediaAlt(post) {
  const written = (post?.alt || "").trim();
  if (written) return written;
  if ((post?.text || "").trim()) return "";
  return `Photo shared by @${post?.authorName || "someone"}`;
}

/** Stories carry no caption, so there is nothing to fall back to but the author. */
export function storyAlt(item, authorName) {
  const written = (item?.alt || "").trim();
  return written || `Story from @${authorName || "someone"}`;
}
