import { useEffect, useState } from "react";
import { ArrowLeft, FileX } from "lucide-react";
import { fetchPost } from "../lib/db";
import { goBack } from "../lib/router";
import { usePostStates } from "../lib/usePostStates";
import IconButton from "./ui/IconButton";
import Button from "./ui/Button";
import { EmptyState } from "./ui/States";
import PostCard from "./PostCard";
import { FeedSkeleton } from "./HomeFeed";

/* One post on its own URL: where shared links and chat previews land. */
export default function PostViewer({ postId }) {
  const [post, setPost] = useState(undefined); // undefined = loading, null = gone
  const [viewer, setViewer] = usePostStates(post ? [post] : null);

  useEffect(() => {
    let cancelled = false;
    fetchPost(postId).then((p) => { if (!cancelled) setPost(p); }).catch(() => { if (!cancelled) setPost(null); });
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".z-sheet")) goBack("/"); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Post"
      className="fixed inset-0 z-overlay overflow-y-auto bg-canvas anim-fade md:left-[76px] xl:left-64">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/")} />
        <h1 className="text-title-3">Post</h1>
      </header>
      <div className="mx-auto max-w-[640px] pb-16 md:border-x md:border-line md:min-h-[calc(100%-56px)]">
        {post === undefined && <FeedSkeleton count={1} />}
        {post === null && (
          <EmptyState icon={FileX} title="This post isn't available"
            body="It may have been deleted, or it's followers-only and you don't follow the author."
            action={<Button onClick={() => goBack("/")}>Go back</Button>} />
        )}
        {post && <PostCard post={post} viewer={viewer} onViewerChange={setViewer} onRemoved={() => goBack("/")} />}
      </div>
    </div>
  );
}
