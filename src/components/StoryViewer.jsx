import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pause, Play, ChevronLeft, ChevronRight, Trash2, Heart, SendHorizontal, Waves, Eye, Star, Pencil } from "lucide-react";
import {
  deleteStory, me, hasLikedStory, likeStory, fetchStoryLikes, fetchStoryViews, viewersKept, markStoryViewed, fetchEchoes, addEcho, deleteEcho, replyToStory, storyExpired,
  ECHO_MAX, QUICK_REACTIONS,
} from "../lib/db";
import { checkContent, markPosted, hitsHiddenWords } from "../lib/moderation";
import { useToast } from "./ui/toast-context";
import { useShell } from "./shell/ShellContext";
import { storyAlt } from "../lib/a11y";
import { shortTime, plural } from "../lib/format";
import LiveAvatar from "./ui/LiveAvatar";
import MediaImg from "./ui/MediaImg";
import IconButton from "./ui/IconButton";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useMediaSrc } from "../lib/media";
import { filterById, vignetteCss } from "../lib/storyCanvas";

const AddToHighlight = lazy(() => import("./Highlights").then((m) => ({ default: m.AddToHighlight })));


// Auto-advance is pausable (WCAG 2.2.2) via button, press-and-hold, space.
// Viewers can reply (DM), react, like and echo; authors see activity.
// `highlight` plays a profile highlight; its owner can jump to editing it.
export default function StoryViewer({ thread, onClose, onNextThread, onDeleted, startPanel = null, startTab = null, startAt = 0, highlight = null, onEditHighlight }) {
  const trap = useFocusTrap();
  const toast = useToast();
  const { hiddenAuthors, hiddenWords } = useShell();
  const [idx, setIdx] = useState(Math.min(startAt, thread.items.length - 1));
  const [paused, setPaused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(startPanel); // null | "echoes" | "activity"
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);
  // Per-story { liked, echoes, likes, views }
  const [meta, setMeta] = useState({});
  const closeRef = useRef(null);
  const item = thread.items[idx];
  const isVideo = item.mediaType?.startsWith("video/");
  // A photo shows for as long as its author chose (5 seconds unless they changed it).
  const imageMs = (item.seconds || 5) * 1000;
  const mine = item.authorId === me();
  const info = meta[item.id] || {};
  const patch = (id, p) => setMeta((m) => ({ ...m, [id]: { ...m[id], ...p } }));
  const held = paused || confirming || !!panel || typing || adding;

  const next = () => {
    if (idx + 1 < thread.items.length) setIdx(idx + 1);
    else onNextThread();
  };
  const prev = () => setIdx(Math.max(0, idx - 1));

  useEffect(() => {
    let live = true;
    const id = item.id;
    const got = (p) => { if (live) setMeta((m) => ({ ...m, [id]: { ...m[id], ...p } })); };
    fetchEchoes(id).then((echoes) => got({ echoes })).catch(() => got({ echoes: [] }));
    if (mine) {
      fetchStoryLikes(id).then((likes) => got({ likes })).catch(() => got({ likes: [] }));
      if (viewersKept(item)) fetchStoryViews(id).then((views) => got({ views })).catch(() => got({ views: [] }));
      else got({ views: [] });
    } else {
      hasLikedStory(id).then((liked) => got({ liked }));
      markStoryViewed(item);
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, mine]);

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

  const toggleLike = async () => {
    const on = !info.liked;
    patch(item.id, { liked: on });
    try { await likeStory(item, on); }
    catch { patch(item.id, { liked: !on }); toast({ tone: "error", title: "Couldn't like the story" }); }
  };

  const sendReply = async (text) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await replyToStory(item, t);
      setReply("");
      setTyping(false);
      document.activeElement?.blur?.();
      toast({ title: `Sent to @${thread.authorName}`, body: "It's in your messages with them." });
    } catch (err) {
      toast({ tone: "error", title: "Couldn't send your reply", body: err?.message?.startsWith("You can't message") ? err.message : "Check your connection and try again." });
    } finally {
      setSending(false);
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
    if (isVideo || held) return;
    const t = setTimeout(next, imageMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread, held]);

  useEffect(() => {
    const onKey = (e) => {
      if (adding) return; // the dialog in front handles its own keys
      if (e.key === "Escape") { if (panel) setPanel(null); else onClose(); return; }
      // Don't hijack keys while typing.
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || panel) return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, thread, panel, adding]);

  const echoes = (info.echoes || []).filter((e) => !hiddenAuthors.has(e.authorId) && !hitsHiddenWords(e.text, hiddenWords));
  // Views merged with likes (likes can predate view tracking).
  const viewers = info.views && info.likes ? (() => {
    const liked = new Set(info.likes.map((l) => l.uid));
    const seen = new Set(info.views.map((v) => v.uid));
    return [...info.views, ...info.likes.filter((l) => !seen.has(l.uid))]
      .map((v) => ({ ...v, liked: liked.has(v.uid) }))
      .sort((a, b) => Number(b.liked) - Number(a.liked));
  })() : null;
  const echoCount = info.echoes ? echoes.length : null;
  const expired = storyExpired(item);

  return createPortal(
    <div ref={trap} role="dialog" aria-modal="true" aria-label={`@${thread.authorName}'s story`} data-theme="dark"
      className="fixed inset-0 z-sheet flex items-center justify-center bg-black anim-fade">
      <div className="relative h-full w-full max-w-md md:h-[92dvh] md:overflow-hidden md:rounded-sheet">
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1 pt-safe" aria-hidden="true">
          {thread.items.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < idx && <div className="h-full w-full bg-white" />}
              {i === idx && !isVideo && (
                <div key={item.id} className="h-full bg-white"
                  style={{ animation: `mesh-story-bar ${imageMs}ms linear both`, animationPlayState: held ? "paused" : "running" }} />
              )}
              {i === idx && isVideo && <div className="h-full w-full bg-white/70" />}
            </div>
          ))}
        </div>

        <div className="absolute inset-x-2 top-6 z-10 flex items-center gap-2 pt-safe">
          <LiveAvatar uid={thread.authorId} profile={{ username: thread.authorName, photoURL: thread.authorPhoto }} size={32} />
          <p className="min-w-0 flex-1 text-callout font-semibold text-white drop-shadow">
            {thread.authorName} <span className="font-normal text-white/75">{highlight ? `${highlight.title} · ` : ""}{shortTime(item.createdAt)}</span>
          </p>
          <IconButton icon={held ? Play : Pause} label={held ? "Play story" : "Pause story"} tone="overlay"
            onClick={() => { if (held) { setPaused(false); setPanel(null); } else setPaused(true); }} />
          {mine && <IconButton icon={Star} label="Add to a highlight" tone="overlay" onClick={() => setAdding(true)} />}
          {mine && onEditHighlight && <IconButton icon={Pencil} label="Edit this highlight" tone="overlay" onClick={onEditHighlight} />}
          {mine && (
            <IconButton icon={Trash2} label="Delete this story" tone="overlay"
              onClick={() => setConfirming(true)} />
          )}
          <IconButton ref={closeRef} icon={X} label="Close story" tone="overlay" onClick={onClose} />
        </div>

        <div className="flex h-full w-full items-center justify-center bg-surface"
          onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
          {item.fit ? (
            <StoryFrame key={item.id} item={item} held={held} onEnded={next} alt={storyAlt(item, thread.authorName)} />
          ) : isVideo ? (
            <video key={item.id} src={item.mediaUrl} className="h-full w-full object-contain" autoPlay playsInline
              onEnded={next} aria-label={storyAlt(item, thread.authorName)} ref={(el) => { if (el) { if (held) el.pause(); else el.play?.().catch(() => {}); } }} />
          ) : (
            <MediaImg key={item.id} src={item.mediaUrl} alt={storyAlt(item, thread.authorName)} className="h-full w-full object-contain anim-fade" placeholderClass="h-full w-full" />
          )}
        </div>

        <button type="button" onClick={prev} aria-label="Previous story"
          className="absolute inset-y-20 left-0 flex w-1/3 items-center justify-start pl-2 text-white/0 hover:text-white/80 focus-visible:text-white/80">
          <ChevronLeft size={32} aria-hidden="true" />
        </button>
        <button type="button" onClick={next} aria-label="Next story"
          className="absolute inset-y-20 right-0 flex w-1/3 items-center justify-end pr-2 text-white/0 hover:text-white/80 focus-visible:text-white/80">
          <ChevronRight size={32} aria-hidden="true" />
        </button>

        {/* Past stories (highlights) can't be replied to, so viewers get no reply bar. */}
        {!panel && !confirming && (mine || !expired) && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-10">
            {mine ? (
              <button type="button" onClick={() => setPanel("activity")}
                className="press mx-auto flex min-h-11 items-center gap-3 rounded-full bg-black/45 px-4 text-callout font-semibold text-white backdrop-blur-sm">
                <span className="flex items-center gap-1.5"><Eye size={16} aria-hidden="true" /> {viewers ? viewers.length : "·"}</span>
                <span className="flex items-center gap-1.5"><Heart size={16} aria-hidden="true" /> {info.likes ? info.likes.length : "·"}</span>
                <span className="flex items-center gap-1.5"><Waves size={16} aria-hidden="true" /> {echoCount ?? "·"}</span>
                <span>Activity</span>
              </button>
            ) : (
              <>
                {typing && !reply && !expired && (
                  <div className="mb-3 flex justify-around" role="group" aria-label="Quick reactions">
                    {QUICK_REACTIONS.map((r) => (
                      <button key={r} type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => sendReply(r)} disabled={sending}
                        aria-label={`Send ${r} to @${thread.authorName}`} className="press text-[1.9rem] leading-none disabled:opacity-50">{r}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <form className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); sendReply(reply); }}>
                    <label htmlFor="story-reply" className="sr-only">{`Reply privately to @${thread.authorName}`}</label>
                    <input id="story-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000}
                      onFocus={() => setTyping(true)} onBlur={() => { if (!reply) setTyping(false); }}
                      placeholder={`Reply to @${thread.authorName}…`} autoComplete="off" disabled={expired}
                      className="h-11 w-full rounded-full border border-white/50 bg-black/20 pl-4 pr-11 text-callout text-white placeholder:text-white/75 focus:border-white focus:outline-none disabled:opacity-50" />
                    {reply.trim() && (
                      <button type="submit" disabled={sending} aria-label="Send reply"
                        className="press absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white disabled:opacity-60">
                        <SendHorizontal size={16} aria-hidden="true" />
                      </button>
                    )}
                  </form>
                  {!typing && (
                    <>
                      <button type="button" onClick={toggleLike} aria-pressed={!!info.liked} disabled={expired || info.liked === undefined}
                        aria-label={info.liked ? "Unlike story" : `Like story (only @${thread.authorName} sees)`}
                        className="press flex h-11 w-11 items-center justify-center text-white disabled:opacity-50">
                        <Heart size={26} aria-hidden="true" className={info.liked ? "fill-like text-like" : ""} />
                      </button>
                      <button type="button" onClick={() => setPanel("echoes")}
                        aria-label={`Echoes, public replies${echoCount ? `: ${plural(echoCount, "echo", "echoes")}` : ""}`}
                        className="press flex h-11 items-center gap-1 px-1 text-white">
                        <Waves size={26} aria-hidden="true" />
                        {!!echoCount && <span className="text-callout font-semibold tabular">{echoCount}</span>}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {panel && (
          <StoryPanel panel={panel} setPanel={setPanel} story={item} mine={mine} expired={expired}
            echoes={echoes} viewers={viewers} authorName={thread.authorName} startTab={startTab}
            onEchoes={(list) => patch(item.id, { echoes: list })} rawEchoes={info.echoes || []} />
        )}

        {adding && (
          <Suspense fallback={null}>
            <AddToHighlight story={item} ownerId={thread.authorId} onClose={() => setAdding(false)} />
          </Suspense>
        )}

        {confirming && (
          <div role="alertdialog" aria-label="Delete this story?" className="absolute inset-x-4 bottom-8 z-30 rounded-card bg-surface p-4 text-fg shadow-overlay pb-safe">
            <p className="text-callout font-semibold">Delete this story?</p>
            <p className="mt-1 text-caption text-fg-muted">It's removed for everyone straight away, with its views, likes and echoes.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                className="press min-h-10 rounded-control px-4 text-callout font-semibold hover:bg-surface-2">Cancel</button>
              <button type="button" onClick={remove} disabled={busy}
                className="press min-h-10 rounded-control bg-danger px-4 text-callout font-semibold text-white disabled:opacity-60">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function StoryPanel({ panel, setPanel, story, mine, expired, echoes, rawEchoes, viewers, authorName, onEchoes, startTab }) {
  const toast = useToast();
  const [tab, setTab] = useState(startTab || (panel === "activity" ? "viewers" : "echoes"));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listEnd = useRef(null);

  useEffect(() => { if (panel === "echoes") inputRef.current?.focus(); }, [panel]);

  const post = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const mod = checkContent(t, { key: "comment" });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try {
      const echo = await addEcho(story, t);
      markPosted("comment", t);
      onEchoes([...rawEchoes, echo]);
      setText("");
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? `@${authorName} isn't taking echoes from you on this story.`
        : "Couldn't post your echo. It's still here, so try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (echo) => {
    onEchoes(rawEchoes.filter((x) => x.id !== echo.id));
    try { await deleteEcho(story, echo); }
    catch { onEchoes(rawEchoes); toast({ tone: "error", title: "Couldn't delete the echo" }); }
  };

  const title = panel === "activity" ? "Your story" : "Echoes";
  return (
    <div role="dialog" aria-label={title} className="absolute inset-x-0 bottom-0 z-30 flex max-h-[62%] flex-col rounded-t-sheet bg-surface text-fg shadow-overlay anim-fade">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-callout font-semibold">{title}</p>
          <p className="text-caption text-fg-muted">
            {panel === "activity" ? "Only you see who viewed and liked it." : "Public replies: everyone who can see this story can read them."}
          </p>
        </div>
        <IconButton icon={X} label="Close" onClick={() => setPanel(null)} />
      </div>

      {panel === "activity" && (
        <div role="tablist" aria-label="Story activity" className="flex gap-1 px-3 pt-2">
          {[["viewers", `Viewers · ${viewers ? viewers.length : "…"}`], ["echoes", `Echoes · ${echoes.length}`]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`press min-h-9 rounded-full px-3 text-callout font-semibold ${tab === id ? "bg-fg text-canvas" : "text-fg-muted hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      )}

      <div className="min-h-24 flex-1 overflow-y-auto px-4 py-3">
        {panel === "activity" && tab === "viewers" ? (
          !viewers ? <p className="text-callout text-fg-muted">Loading…</p>
            : !viewers.length ? (
              <p className="text-callout text-fg-muted">
                {viewersKept(story) ? "No one's seen it yet." : "Who viewed a story is deleted 48 hours after you post it. Likes stay."}
              </p>
            ) : (
              <ul className="space-y-3">
                {!viewersKept(story) && <li className="text-caption text-fg-subtle">Who viewed it was deleted 48 hours after you posted it. These are the people who liked it.</li>}
                {viewers.map((v) => (
                  <li key={v.uid} className="flex items-center gap-3">
                    <LiveAvatar uid={v.uid} profile={{ username: v.username }} size={32} />
                    <span className="min-w-0 flex-1 truncate text-callout font-medium">@{v.username}</span>
                    {v.liked && <Heart size={16} className="fill-like text-like" aria-label="liked it" />}
                  </li>
                ))}
              </ul>
            )
        ) : !echoes.length ? (
          <p className="text-callout text-fg-muted">{expired ? "No echoes, and this story has ended." : "No echoes yet. Be the first."}</p>
        ) : (
          <ul className="space-y-3">
            {echoes.map((e) => (
              <li key={e.id} className="group flex gap-3">
                <LiveAvatar uid={e.authorId} profile={{ username: e.authorName, photoURL: e.authorPhoto }} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-callout"><span className="font-semibold">{e.authorName}</span> <span className="break-words">{e.text}</span></p>
                  <p className="text-caption text-fg-subtle">{shortTime(e.createdAt)}</p>
                </div>
                {(mine || e.authorId === me()) && (
                  <IconButton icon={Trash2} size={16} label="Delete echo" onClick={() => remove(e)} />
                )}
              </li>
            ))}
            <li ref={listEnd} aria-hidden="true" />
          </ul>
        )}
      </div>

      {!(panel === "activity" && tab === "viewers") && !expired && (
        <form onSubmit={post} className="border-t border-line px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="mb-1.5 text-caption text-danger-text">{error}</p>}
          <div className="flex items-center gap-2">
            <label htmlFor="echo-text" className="sr-only">Add an echo (public)</label>
            <input id="echo-text" ref={inputRef} value={text} onChange={(e) => { setText(e.target.value); setError(""); }}
              maxLength={ECHO_MAX} placeholder="Add an echo…" autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-callout text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent" />
            <button type="submit" disabled={busy || !text.trim()}
              className="press min-h-10 rounded-full bg-accent px-4 text-callout font-semibold text-white disabled:opacity-50">
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// A story made in the story editor: a 9:16 frame with the photo or video,
// its filter (videos), its drawn text layer (videos) and animated GIFs on top.
function StoryFrame({ item, held, onEnded, alt }) {
  const isVideo = item.mediaType?.startsWith("video/");
  const overlay = useMediaSrc(item.overlayUrl || "");
  const look = filterById(item.filter);
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ containerType: "size" }}>
      <div className="relative overflow-hidden bg-black" style={{ width: "min(100cqw, calc(100cqh * 9 / 16))", aspectRatio: "9 / 16" }}>
        {isVideo ? (
          <video src={item.mediaUrl} autoPlay playsInline muted={!!item.muted} onEnded={onEnded} aria-label={alt}
            className="absolute inset-0 h-full w-full" style={{ objectFit: item.fit === "cover" ? "cover" : "contain", filter: look.css || undefined }}
            ref={(el) => { if (el) { el.muted = !!item.muted; if (held) el.pause(); else el.play?.().catch(() => {}); } }} />
        ) : (
          <MediaImg src={item.mediaUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover anim-fade" placeholderClass="absolute inset-0 h-full w-full" />
        )}
        {isVideo && look.vignette && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: vignetteCss(look.vignette) }} />}
        {overlay && <img src={overlay} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />}
        {(item.gifs || []).map((g, i) => (
          <img key={i} src={g.url} alt="" className="pointer-events-none absolute"
            style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, transform: `translate(-50%, -50%) rotate(${g.r}rad)` }} />
        ))}
      </div>
    </div>
  );
}
