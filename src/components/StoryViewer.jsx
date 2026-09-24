import { useEffect, useState } from "react";
import { timeAgo } from "../lib/db";
import { Avatar } from "./Nav";
import { storyAlt } from "../lib/a11y";

const IMAGE_MS = 5000;

export default function StoryViewer({ thread, onClose, onNextThread }) {
  const [idx, setIdx] = useState(0);
  const item = thread.items[idx];
  const isVideo = item.mediaType?.startsWith("video/");

  const next = () => {
    if (idx + 1 < thread.items.length) setIdx(idx + 1);
    else onNextThread();
  };
  const prev = () => setIdx(Math.max(0, idx - 1));

  useEffect(() => {
    if (isVideo) return;
    const t = setTimeout(next, IMAGE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center anim-fade" onClick={onClose}>
      <div className="relative h-full max-h-[92vh] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {/* progress bars */}
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
          {thread.items.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 rounded bg-white/25 overflow-hidden">
              {i < idx && <div className="h-full w-full bg-white" />}
              {i === idx && !isVideo && (
                <div className="h-full bg-white" style={{ animation: `mesh-story-bar ${IMAGE_MS}ms linear both` }} />
              )}
              {i === idx && isVideo && <div className="h-full w-full bg-white/60" />}
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute top-6 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar profile={{ username: thread.authorName, photoURL: thread.authorPhoto }} size={9} />
            <div>
              <p className="text-sm font-semibold drop-shadow">@{thread.authorName}</p>
              <p className="text-[10px] text-zinc-300 drop-shadow">{timeAgo(item.createdAt)}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close story"
            className="min-h-[44px] px-2 text-white/80 hover:text-white text-2xl leading-none drop-shadow">✕</button>
        </div>

        {/* media */}
        <div className="h-full w-full flex items-center justify-center bg-zinc-950 md:rounded-2xl overflow-hidden">
          {isVideo ? (
            <video key={item.id} src={item.mediaUrl} className="h-full w-full object-contain" autoPlay playsInline onEnded={next} />
          ) : (
            <img key={item.id} src={item.mediaUrl} alt={storyAlt(item, thread.authorName)} className="h-full w-full object-contain anim-fade" />
          )}
        </div>

        {/* tap zones */}
        <button className="absolute inset-y-0 left-0 w-1/3" onClick={prev} aria-label="Previous" />
        <button className="absolute inset-y-0 right-0 w-1/3" onClick={next} aria-label="Next" />
      </div>
    </div>
  );
}
