import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { fetchActiveStories, uploadMedia, createStory, me, storySeen, StorageUnavailableError } from "../lib/db";
import { validateMediaFile } from "../lib/validate";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import { Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
const StoryViewer = lazy(() => import("./StoryViewer"));

const seenAll = (t) => t.items.every(storySeen);
// Others' stories, unseen first, like Instagram. Seen ones stay, with a grey ring.
const lineUp = (threads) => {
  const others = threads.filter((t) => t.authorId !== me());
  return [...others.filter((t) => !seenAll(t)), ...others.filter(seenAll)];
};

export default function StoryRail() {
  const { profile, following, hiddenAuthors } = useShell();
  const toast = useToast();
  const [threads, setThreads] = useState([]);
  // Rail order, refreshed when stories load and when the viewer closes, not mid-viewing.
  const [queue, setQueue] = useState([]);
  const [viewing, setViewing] = useState(null); // { list, at }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    const list = (await fetchActiveStories(following)).filter((x) => !hiddenAuthors.has(x.authorId));
    setThreads(list);
    setQueue(lineUp(list));
    return list;
  };
  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, hiddenAuthors]);

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
      await load();
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

  const mine = threads.find((t) => t.authorId === me());
  const close = () => { setViewing(null); setQueue(lineUp(threads)); };
  const current = viewing && viewing.list[viewing.at];

  return (
    <section aria-label="Stories" className="border-b border-line">
      <ul className="flex gap-4 overflow-x-auto no-scrollbar px-4 py-3">
        <li className="relative flex w-[68px] shrink-0 flex-col items-center gap-1.5">
          <button type="button"
            onClick={() => (mine ? setViewing({ list: [mine], at: 0 }) : fileRef.current?.click())}
            aria-label={mine ? "View your story" : "Add to your story"}
            className="press rounded-full">
            <Avatar profile={profile} size={60} ring={!!mine} />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            aria-label="Add to your story"
            className="press absolute right-0 top-[40px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-accent text-white">
            {uploading ? <Spinner size={12} /> : <Plus size={14} strokeWidth={3} aria-hidden="true" />}
          </button>
          <span className="w-full truncate text-center text-label text-fg-muted">Your story</span>
        </li>

        {queue.map((t, i) => {
          const seen = seenAll(t);
          return (
            <li key={t.authorId} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
              <button type="button" onClick={() => setViewing({ list: queue, at: i })}
                aria-label={`View @${t.authorName}'s story${seen ? ", seen" : ""}`} className="press rounded-full">
                <Avatar profile={{ username: t.authorName, photoURL: t.authorPhoto }} size={60} ring={seen ? "seen" : true} />
              </button>
              <span className={`w-full truncate text-center text-label ${seen ? "text-fg-subtle" : "text-fg-muted"}`}>{t.authorName}</span>
            </li>
          );
        })}
      </ul>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStory}
        aria-hidden="true" tabIndex={-1} />

      {current && (
        <Suspense fallback={null}>
          {/* Opens at the first story not yet seen; once all are seen, from the start. */}
          <StoryViewer key={current.authorId} thread={current} onClose={close}
            startAt={Math.max(0, current.items.findIndex((s) => !storySeen(s)))}
            onNextThread={() => (viewing.at + 1 < viewing.list.length ? setViewing({ ...viewing, at: viewing.at + 1 }) : close())}
            onDeleted={(id) => setThreads((list) => list
              .map((t) => ({ ...t, items: t.items.filter((i) => i.id !== id) }))
              .filter((t) => t.items.length))} />
        </Suspense>
      )}
    </section>
  );
}
