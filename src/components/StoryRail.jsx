import { useEffect, useRef, useState } from "react";
import { fetchActiveStories, uploadMedia, createStory, me, StorageUnavailableError } from "../lib/db";
import { validateMediaFile } from "../lib/validate";
import { Avatar } from "./Nav";
import StoryViewer from "./StoryViewer";

export default function StoryRail() {
  const [threads, setThreads] = useState([]); // one per author
  const [viewing, setViewing] = useState(null); // index into threads
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    fetchActiveStories().then(setThreads).catch(() => {});
  }, []);

  const addStory = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const v = validateMediaFile(file, kind);
    if (v.error) return setError(v.error);
    setError("");
    setUploading(true);
    try {
      const { url, path } = await uploadMedia(file);
      await createStory({ mediaUrl: url, mediaPath: path, mediaType: file.type });
      setThreads(await fetchActiveStories());
    } catch (err) {
      console.error(err);
      setError(err instanceof StorageUnavailableError ? err.message : "Story upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const myThreadIdx = threads.findIndex((t) => t.authorId === me());

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
        {/* your story / add */}
        <div
          onClick={() => (myThreadIdx !== -1 ? setViewing(myThreadIdx) : fileRef.current?.click())}
          className="flex flex-col items-center gap-1.5 shrink-0 w-16 cursor-pointer"
        >
          <div className="relative">
            <div className={`h-14 w-14 rounded-full p-[2px] ${myThreadIdx !== -1 ? "bg-gradient-to-tr from-violet-500 to-fuchsia-500" : "bg-zinc-800"}`}>
              <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center text-xl">
                {uploading ? <span className="animate-pulse text-xs">…</span> : "🙂"}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-violet-600 text-xs flex items-center justify-center border-2 border-zinc-950"
              aria-label="Add story"
            >
              +
            </button>
          </div>
          <span className="text-[10px] text-zinc-400">Your story</span>
        </div>

        {threads.map((t, i) =>
          t.authorId === me() ? null : (
            <button key={t.authorId} onClick={() => setViewing(i)} className="flex flex-col items-center gap-1.5 shrink-0 w-16 anim-pop">
              <div className="h-14 w-14 rounded-full p-[2px] bg-gradient-to-tr from-violet-500 to-fuchsia-500">
                <div className="h-full w-full rounded-full bg-zinc-950 p-[2px]">
                  <Avatar profile={{ username: t.authorName, photoURL: t.authorPhoto }} size={12} className="h-full w-full" />
                </div>
              </div>
              <span className="text-[10px] text-zinc-400 truncate w-full text-center">@{t.authorName}</span>
            </button>
          )
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStory} />

      {viewing !== null && threads[viewing] && (
        <StoryViewer
          thread={threads[viewing]}
          onClose={() => setViewing(null)}
          onNextThread={() => setViewing(viewing + 1 < threads.length ? viewing + 1 : null)}
        />
      )}
    </div>
  );
}
