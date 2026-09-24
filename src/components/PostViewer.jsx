import { useEffect, useState } from "react";
import { fetchPost, fetchMyLikes, fetchMySaves } from "../lib/db";
import PostCard from "./PostCard";

/* Opened when someone taps a shared-post preview in a chat, so a link in a DM
   lands on the real post rather than a dead end. */
export default function PostViewer({ postId, onClose }) {
  const [post, setPost] = useState(undefined); // undefined = loading, null = gone
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchPost(postId);
        if (cancelled) return;
        setPost(p);
        if (p) {
          const [likes, saves] = await Promise.all([
            fetchMyLikes([p.id]).catch(() => new Set()),
            fetchMySaves([p.id]).catch(() => new Set()),
          ]);
          if (!cancelled) { setLiked(likes.has(p.id)); setSaved(saves.has(p.id)); }
        }
      } catch {
        if (!cancelled) setPost(null);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/98 backdrop-blur anim-fade"
      role="dialog" aria-modal="true" aria-label="Post">
      <div className="max-w-xl mx-auto px-4 py-6 pb-24">
        <button onClick={onClose}
          className="mb-4 min-h-[44px] text-sm text-zinc-400 hover:text-zinc-200">
          ← Back
        </button>

        {post === undefined && <p className="text-zinc-400">Loading post…</p>}
        {post === null && (
          <div className="text-center text-zinc-400 mt-16">
            <p className="text-lg font-semibold text-zinc-300">Post unavailable</p>
            <p className="text-sm mt-1">It may have been deleted, or you may not have access.</p>
          </div>
        )}
        {post && (
          <PostCard post={post} liked={liked} saved={saved}
            onLikedChange={(_, on) => setLiked(on)}
            onSavedChange={(_, on) => setSaved(on)}
            onDeleted={onClose} />
        )}
      </div>
    </div>
  );
}
