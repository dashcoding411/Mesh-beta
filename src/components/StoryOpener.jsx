import { lazy, Suspense, useEffect, useState } from "react";
import { fetchStory, me, storyExpired } from "../lib/db";
import { OPEN_STORY_EVENT } from "../lib/openStory";
import { useToast } from "./ui/toast-context";
const StoryViewer = lazy(() => import("./StoryViewer"));

// Others' stories open only while live; the author's own open any time.
export default function StoryOpener() {
  const toast = useToast();
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const onOpen = async (e) => {
      const { id, panel = null, tab = null } = e.detail || {};
      const story = id ? await fetchStory(id) : null;
      if (!story) return toast({ title: "That story isn't available", body: "It may have been deleted." });
      if (story.authorId !== me() && storyExpired(story)) return toast({ title: "That story has ended", body: "Stories last 24 hours." });
      setOpen({ panel, tab, thread: { authorId: story.authorId, authorName: story.authorName, authorPhoto: story.authorPhoto, items: [story] } });
    };
    window.addEventListener(OPEN_STORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STORY_EVENT, onOpen);
  }, [toast]);

  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <Suspense fallback={null}>
      <StoryViewer key={open.thread.items[0].id} thread={open.thread} startPanel={open.panel} startTab={open.tab}
        onClose={close} onNextThread={close} onDeleted={close} />
    </Suspense>
  );
}
