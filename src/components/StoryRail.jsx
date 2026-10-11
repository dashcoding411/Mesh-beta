import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { fetchActiveStories, uploadMedia, createStory, me, storySeen, videoUploadsAvailable, StorageUnavailableError, deleteInline, deleteCloudMedia } from "../lib/db";
import { storeOverlay } from "../lib/media";
import { cameraSupported } from "../lib/cameras";
import { validateMediaFile } from "../lib/validate";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import { Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
const StoryViewer = lazy(() => import("./StoryViewer"));
const Camera = lazy(() => import("./Camera"));
const StoryEditor = lazy(() => import("./story/StoryEditor"));

// Phones open the camera first, like Instagram and Snapchat; computers pick a file.
const cameraFirst = () => cameraSupported() && window.matchMedia("(pointer: coarse)").matches;
export const STORY_CAMERA_EVENT = "mesh:story-camera";

const seenAll = (t) => t.items.every(storySeen);
// Others' stories, unseen first, like Instagram. Seen ones stay, with a grey ring.
const lineUp = (threads) => {
  const others = threads.filter((t) => t.authorId !== me());
  return [...others.filter((t) => !seenAll(t)), ...others.filter(seenAll)];
};

/**
 * The story row. `bare` renders only its camera and editor (no row): Home's
 * other feeds use it so a swipe left still opens the story camera there.
 */
export default function StoryRail({ bare = false }) {
  const { profile, following, hiddenAuthors, openComposer } = useShell();
  const toast = useToast();
  const [threads, setThreads] = useState([]);
  // Rail order, refreshed when stories load and when the viewer closes, not mid-viewing.
  const [queue, setQueue] = useState([]);
  const [viewing, setViewing] = useState(null); // { list, at }
  const [uploading, setUploading] = useState(false);
  const [camera, setCamera] = useState(null); // { video }
  const [editing, setEditing] = useState(null); // { file, fromCamera }
  const fileRef = useRef(null);

  const load = async () => {
    const list = (await fetchActiveStories(following)).filter((x) => !hiddenAuthors.has(x.authorId));
    setThreads(list);
    setQueue(lineUp(list));
    return list;
  };
  useEffect(() => {
    if (!bare) load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, hiddenAuthors, bare]);

  const startStory = async () => {
    if (!cameraFirst()) return fileRef.current?.click();
    // Hold-to-record only when videos can be uploaded.
    setCamera({ video: await videoUploadsAvailable().catch(() => false) });
  };
  // Swiping left on Home opens the story camera (HomeFeed).
  useEffect(() => {
    const open = () => { if (!camera && !editing && cameraFirst()) startStory(); };
    window.addEventListener(STORY_CAMERA_EVENT, open);
    return () => window.removeEventListener(STORY_CAMERA_EVENT, open);
  });

  const addStory = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) openEditor(file, false);
  };

  // Every story goes through the editor first, from the camera or a file.
  const openEditor = async (file, fromCamera) => {
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const v = validateMediaFile(file, kind);
    if (v.error) return toast({ tone: "error", title: v.error });
    if (kind === "video" && !(await videoUploadsAvailable().catch(() => false))) {
      return toast({ tone: "error", title: "Video stories aren't switched on yet", body: "Photos work, so try one of those." });
    }
    setEditing({ file, fromCamera });
  };

  // `story` comes from the editor: the file, and for videos the drawn layer over it.
  const publishStory = async (story) => {
    setUploading(true);
    let uploaded = [];
    try {
      const { url, path } = await uploadMedia(story.file, undefined, "stories");
      uploaded = [url];
      const overlay = story.overlay ? await storeOverlay(story.overlay) : null;
      if (overlay) uploaded.push(overlay.url);
      await createStory({
        mediaUrl: url, mediaPath: path, mediaType: story.file.type, audience: story.audience,
        fit: story.fit, filter: story.filter, overlayUrl: overlay?.url, gifs: story.gifs, text: story.text, seconds: story.seconds, muted: story.muted,
      });
      uploaded = [];
      await load();
      toast({ title: "Added to your story", body: story.audience === "followers" ? "Your followers can see it for 24 hours." : "It disappears after 24 hours." });
    } catch (err) {
      console.error(err);
      toast({
        tone: "error",
        title: err?.name === "UnsafeImageError" ? "This can't go on your story"
          : err instanceof StorageUnavailableError ? "Photo and video uploads aren't switched on yet" : "Your story didn't upload",
        body: err?.name === "UnsafeImageError" ? err.message
          : err instanceof StorageUnavailableError ? "Strands still work, so try posting words instead." : "Check your connection and try again.",
      });
    } finally {
      // A story that didn't post leaves nothing behind.
      for (const url of uploaded) { deleteInline(url).catch(() => {}); deleteCloudMedia(url).catch(() => {}); }
      setUploading(false);
    }
  };

  const mine = threads.find((t) => t.authorId === me());
  const close = () => { setViewing(null); setQueue(lineUp(threads)); };
  const current = viewing && viewing.list[viewing.at];

  // The camera, the file picker and the editor: what a new story goes through.
  const tools = (
    <>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStory}
        aria-hidden="true" tabIndex={-1} />

      {camera && (
        <Suspense fallback={null}>
          <Camera title="Add to your story" photo video={camera.video} scanCodes
            onClose={() => setCamera(null)}
            onCapture={(file) => { setCamera(null); openEditor(file, true); }} />
        </Suspense>
      )}

      {editing && (
        <Suspense fallback={null}>
          <StoryEditor file={editing.file} privateAccount={!!profile?.isPrivate}
            backLabel={editing.fromCamera ? "Retake" : "Cancel"}
            onBack={() => { const again = editing.fromCamera; setEditing(null); if (again) startStory(); }}
            onSendToPost={editing.fromCamera ? (file) => { setEditing(null); openComposer({ kind: file.type.startsWith("video/") ? "video" : "post", files: [file] }); } : undefined}
            onPost={(story) => { setEditing(null); publishStory(story); }} />
        </Suspense>
      )}
    </>
  );
  if (bare) return tools;

  return (
    <section aria-label="Stories" data-tour="stories" className="border-b border-line">
      <ul data-no-swipe className="flex gap-4 overflow-x-auto no-scrollbar px-4 py-3">
        <li className="relative flex w-[68px] shrink-0 flex-col items-center gap-1.5">
          <button type="button"
            onClick={() => (mine ? setViewing({ list: [mine], at: 0 }) : startStory())}
            aria-label={mine ? "View your story" : "Add to your story"}
            className="press rounded-full">
            <Avatar profile={profile} size={60} ring={!!mine} />
          </button>
          <button type="button" onClick={startStory} disabled={uploading}
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
      {tools}

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
