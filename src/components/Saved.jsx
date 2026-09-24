import { useCallback, useEffect, useState } from "react";
import { Bookmark, Lock } from "lucide-react";
import { fetchSavedPosts } from "../lib/db";
import { usePostStates } from "../lib/usePostStates";
import { navigate } from "../lib/router";
import HomeHeader from "./shell/HomeHeader";
import Button from "./ui/Button";
import { EmptyState, ErrorState } from "./ui/States";
import PostCard from "./PostCard";
import { FeedSkeleton } from "./HomeFeed";

/* Everything you've kept. Private: saves never show on your profile and
   nobody else can see them. */
export default function Saved() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(false);
  const [viewer, setViewer] = usePostStates(posts);

  const load = useCallback(async () => {
    try { setPosts(await fetchSavedPosts()); setError(false); }
    catch (e) { console.error(e); setError(true); }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // Unsaving from here removes it from the list, that's the point of the page.
  const onViewerChange = (id, field, on) => {
    setViewer(id, field, on);
    if (field === "saved" && !on) setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <>
      <HomeHeader section="saved" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] md:border-x md:border-line md:min-h-full">
          <p className="flex items-center gap-2 border-b border-line px-4 py-3 text-caption text-fg-subtle">
            <Lock size={14} aria-hidden="true" /> Only you can see what you've saved.
          </p>
          {error && <ErrorState title="Couldn't load your saved posts" onRetry={() => { setError(false); setPosts(null); load(); }} />}
          {!error && posts === null && <FeedSkeleton />}
          {posts?.length === 0 && (
            <EmptyState icon={Bookmark} title="Nothing saved yet"
              body="Tap the bookmark on any post to keep it here for later."
              action={<Button onClick={() => navigate("/")}>Browse For you</Button>} />
          )}
          {posts?.map((p) => (
            <PostCard key={p.id} post={p} viewer={viewer} onViewerChange={onViewerChange}
              onRemoved={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </div>
      </div>
    </>
  );
}
