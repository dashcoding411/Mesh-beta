import { useRef } from "react";
import { useInView } from "../../lib/useInView";
import MediaImg from "../ui/MediaImg";

/** The video's poster, or for older posts a frame from the video itself, loaded near the viewport. */
export default function VideoFrame({ post }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  const at = post.kind === "video" ? post.trailerStart || 1 : 0.5;
  return (
    <span ref={ref} className="absolute inset-0">
      {seen && (post.posterUrl ? (
        <MediaImg src={post.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
      ) : (
        <video src={`${post.mediaUrl}#t=${at}`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true"
          className="h-full w-full object-cover" />
      ))}
    </span>
  );
}
