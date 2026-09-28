import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useMediaSrc } from "../../lib/media";

/* An <img> that understands photos stored in Firestore (`mesh-media:`) as
   well as ordinary URLs, shows a shimmer while it loads, and says so if it
   can't load at all. */
export default function MediaImg({ src, alt, className = "", placeholderClass = "", ...rest }) {
  const url = useMediaSrc(src);
  const [failedFor, setFailedFor] = useState(null);
  if (!src) return null;
  if (failedFor === url && url) {
    return (
      <span role="img" aria-label={alt || "Image unavailable"}
        className={`flex items-center justify-center gap-2 bg-surface-2 text-caption text-fg-subtle ${placeholderClass || className}`}>
        <ImageOff size={16} aria-hidden="true" /> Image unavailable
      </span>
    );
  }
  if (!url) return <span aria-hidden="true" className={`skeleton block ${placeholderClass || className}`} />;
  return <img src={url} alt={alt} className={className} decoding="async" onError={() => setFailedFor(url)} {...rest} />;
}
