import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pause, Play, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { deleteStory, me } from "../lib/db";
import { useToast } from "./ui/toast-context";
import { storyAlt } from "../lib/a11y";
import { shortTime } from "../lib/format";
import Avatar from "./ui/Avatar";
import MediaImg from "./ui/MediaImg";
import IconButton from "./ui/IconButton";

const IMAGE_MS = 5000;

/* Full-screen stories. Auto-advancing content has to be pausable (WCAG
   2.2.2), so there's a pause button as well as press-and-hold; arrow keys
   step through; Escape closes and focus returns to the rail. */
export default function StoryViewer({ thread, onClose, onNextThread, onDeleted }) {
  const toast = useToast();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);
  const item = thread.items[idx];
  const isVideo = item.mediaType?.startsWith("video/");

  const next = () => {
    if (idx + 1 < thread.items.length) setIdx(idx + 1);
    else onNextThread();
  };
  const prev = () => setIdx(Math.max(0, idx - 1));
  const mine = item.authorId === me();

  const remove = async () => {
    setBusy(true);
    try {
      await deleteStory(item);
      toast({ title: "Story deleted" });
      onDeleted?.(item.id);
      if (thread.items.length <= 1) onClose();
      else setIdx(Math.max(0, Math.min(idx, thread.items.length - 2)));
    } catch {
      toast({ tone: "error", title: "Couldn't delete the story" });
    } finally {
      setBusy(false);
      setConfirming(false);
      setPaused(false);
    }
  };

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (isVideo || paused) return;
    const t = setTimeout(next, IMAGE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread, paused]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`@${thread.authorName}'s story`}
      className="fixed inset-0 z-sheet flex items-center justify-center bg-black anim-fade">
      <div className="relative h-full w-full max-w-md md:h-[92dvh] md:overflow-hidden md:rounded-sheet">
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1 pt-safe" aria-hidden="true">
          {thread.items.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < idx && <div className="h-full w-full bg-white" />}
              {i === idx && !isVideo && (
                <div className="h-full bg-white"
                  style={{ animation: `mesh-story-bar ${IMAGE_MS}ms linear both`, animationPlayState: paused ? "paused" : "running" }} />
              )}
              {i === idx && isVideo && <div className="h-full w-full bg-white/70" />}
            </div>
          ))}
        </div>

        <div className="absolute inset-x-2 top-6 z-10 flex items-center gap-2 pt-safe">
          <Avatar profile={{ username: thread.authorName, photoURL: thread.authorPhoto }} size={32} />
          <p className="min-w-0 flex-1 text-callout font-semibold text-white drop-shadow">
            {thread.authorName} <span className="font-normal text-white/75">{shortTime(item.createdAt)}</span>
          </p>
          <IconButton icon={paused ? Play : Pause} label={paused ? "Play story" : "Pause story"} tone="overlay"
            onClick={() => setPaused((p) => !p)} />
          {mine && (
            <IconButton icon={Trash2} label="Delete this story" tone="overlay"
              onClick={() => { setPaused(true); setConfirming(true); }} />
          )}
          <IconButton ref={closeRef} icon={X} label="Close story" tone="overlay" onClick={onClose} />
        </div>

        <div className="flex h-full w-full items-center justify-center bg-surface"
          onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
          {isVideo ? (
            <video key={item.id} src={item.mediaUrl} className="h-full w-full object-contain" autoPlay playsInline
              onEnded={next} aria-label={storyAlt(item, thread.authorName)} />
          ) : (
            <MediaImg key={item.id} src={item.mediaUrl} alt={storyAlt(item, thread.authorName)} className="h-full w-full object-contain anim-fade" placeholderClass="h-full w-full" />
          )}
        </div>

        {confirming && (
          <div role="alertdialog" aria-label="Delete this story?" className="absolute inset-x-4 bottom-8 z-20 rounded-card bg-surface p-4 text-fg shadow-overlay pb-safe">
            <p className="text-callout font-semibold">Delete this story?</p>
            <p className="mt-1 text-caption text-fg-muted">It's removed for everyone straight away.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setConfirming(false); setPaused(false); }} disabled={busy}
                className="press min-h-10 rounded-control px-4 text-callout font-semibold hover:bg-surface-2">Cancel</button>
              <button type="button" onClick={remove} disabled={busy}
                className="press min-h-10 rounded-control bg-danger px-4 text-callout font-semibold text-white disabled:opacity-60">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}

        <button type="button" onClick={prev} aria-label="Previous"
          className="absolute inset-y-20 left-0 flex w-1/3 items-center justify-start pl-2 text-white/0 hover:text-white/80 focus-visible:text-white/80">
          <ChevronLeft size={32} aria-hidden="true" />
        </button>
        <button type="button" onClick={next} aria-label="Next"
          className="absolute inset-y-20 right-0 flex w-1/3 items-center justify-end pr-2 text-white/0 hover:text-white/80 focus-visible:text-white/80">
          <ChevronRight size={32} aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body
  );
}
