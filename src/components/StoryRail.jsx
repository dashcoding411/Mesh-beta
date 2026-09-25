import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { fetchActiveStories, uploadMedia, createStory, me, StorageUnavailableError } from "../lib/db";
import { validateMediaFile } from "../lib/validate";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import { Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import StoryViewer from "./StoryViewer";

/* 24-hour stories across the top of For You. Only shows when there's
   something to show, or you can add one, an empty rail is just clutter. */
export default function StoryRail() {
  const { profile, following, blocked } = useShell();
  const toast = useToast();
  const [threads, setThreads] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    fetchActiveStories(following).then((t) => setThreads(t.filter((x) => !blocked.has(x.authorId)))).catch(() => {});
  }, [following, blocked]);

  const addStory = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const v = validateMediaFile(file, kind);
    if (v.error) return toast({ tone: "error", title: v.error });
    setUploading(true);
    try {
      const { url, path } = await uploadMedia(file);
      await createStory({ mediaUrl: url, mediaPath: path, mediaType: file.type });
      setThreads(await fetchActiveStories(following));
      toast({ title: "Added to your story", body: "It disappears after 24 hours." });
    } catch (err) {
      console.error(err);
      toast({
        tone: "error",
        title: err instanceof StorageUnavailableError ? "Photo and video uploads aren't switched on yet" : "Your story didn't upload",
        body: err instanceof StorageUnavailableError ? "Strands still work, so try posting words instead." : "Check your connection and try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const mineIdx = threads.findIndex((t) => t.authorId === me());
  const others = threads.map((t, i) => ({ t, i })).filter(({ t }) => t.authorId !== me());

  return (
    <section aria-label="Stories" className="border-b border-line">
      <ul className="flex gap-4 overflow-x-auto no-scrollbar px-4 py-3">
        <li className="relative flex w-[68px] shrink-0 flex-col items-center gap-1.5">
          <button type="button"
            onClick={() => (mineIdx !== -1 ? setViewing(mineIdx) : fileRef.current?.click())}
            aria-label={mineIdx !== -1 ? "View your story" : "Add to your story"}
            className="press rounded-full">
            <Avatar profile={profile} size={60} ring={mineIdx !== -1} />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            aria-label="Add to your story"
            className="press absolute right-0 top-[40px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-accent text-white">
            {uploading ? <Spinner size={12} /> : <Plus size={14} strokeWidth={3} aria-hidden="true" />}
          </button>
          <span className="w-full truncate text-center text-label text-fg-muted">Your story</span>
        </li>

        {others.map(({ t, i }) => (
          <li key={t.authorId} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
            <button type="button" onClick={() => setViewing(i)} aria-label={`View @${t.authorName}'s story`}
              className="press rounded-full">
              <Avatar profile={{ username: t.authorName, photoURL: t.authorPhoto }} size={60} ring />
            </button>
            <span className="w-full truncate text-center text-label text-fg-muted">{t.authorName}</span>
          </li>
        ))}
      </ul>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStory}
        aria-hidden="true" tabIndex={-1} />

      {viewing !== null && threads[viewing] && (
        <StoryViewer thread={threads[viewing]} onClose={() => setViewing(null)}
          onNextThread={() => setViewing(viewing + 1 < threads.length ? viewing + 1 : null)} />
      )}
    </section>
  );
}
