import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Check, Download, Globe, Lock, Maximize, Minimize, Minus, Pencil, Plus, RotateCw, Send, Sparkles, Sticker,
  Timer, Trash2, Type, Undo2, Volume2, VolumeX, X,
} from "lucide-react";
import {
  CAPTION_SIZE, FRAME_H, FRAME_W, MAX_GIFS, PHOTO_SECONDS, STORY_FILTERS, TEXT_STYLES,
  applyFilter, colorAt, drawLayer, drawOverlay, drawPhoto, fontFor, fontsReady, vignetteCss,
} from "../../lib/storyCanvas";
import { checkContent } from "../../lib/moderation";
import { motionReduced } from "../../lib/appearance";
import { useFocusTrap } from "../../lib/useFocusTrap";
import Button from "../ui/Button";
import { InlineMessage, Spinner } from "../ui/States";
import { ConfirmDialog } from "../ui/Dialog";
import ColorSlider from "./ColorSlider";
import StickerSheet from "./StickerSheet";

const GifPicker = lazy(() => import("../GifPicker"));

const BRUSHES = [0.007, 0.014, 0.028];
const SIZES = { big: 0.085, label: 0.06, glow: 0.085, emoji: 0.16, info: 0.07, stamp: 0.055, gif: 0.42 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const newId = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;
// Measures layers without drawing anything visible.
let measurer = null;
const measure = () => (measurer ||= document.createElement("canvas").getContext("2d"));

/**
 * Edit a story before it posts, like Snapchat: tap the photo to caption it,
 * swipe for filters, draw, add stickers and GIFs, pinch or scroll to resize
 * and rotate, drag to the bin to remove. Then choose who sees it and post.
 *
 * `onPost(payload)` gets { kind, file, overlay (canvas, videos only), fit,
 * filter, gifs, text, seconds, muted, audience }. `onSendToPost(file)`, if
 * given, adds a "Post" button that sends a flattened copy to the composer.
 */
export default function StoryEditor({ file, onBack, backLabel = "Back", onPost, onSendToPost, privateAccount = false }) {
  const isVideo = file.type.startsWith("video/");
  const trap = useFocusTrap();
  const [img, setImg] = useState(null);
  const [mediaRatio, setMediaRatio] = useState(null); // width / height once known
  const [fitChoice, setFitChoice] = useState(null); // null until the media's shape picks one
  const [filter, setFilter] = useState(0);
  const [layers, setLayers] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [live, setLive] = useState(null); // the stroke being drawn
  const [tool, setTool] = useState(null); // null | "draw" | "stickers" | "gif"
  const [brush, setBrush] = useState(1);
  const [ink, setInk] = useState(0.5);
  const [draft, setDraft] = useState(null); // { id?, text, style, t }
  const [selected, setSelected] = useState(null);
  const [seconds, setSeconds] = useState(5);
  const [muted, setMuted] = useState(false);
  const [audience, setAudience] = useState(privateAccount ? "followers" : "public");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(null); // filter name, shown briefly
  const [dragging, setDragging] = useState(null); // { over } while a layer is dragged
  // The tap that took the photo can still arrive as a click once this is
  // open (phones send it after the finger lifts), on "Post" or "Your story".
  // Clicks are ignored for a moment.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 450);
    return () => clearTimeout(t);
  }, []);
  const [discarding, setDiscarding] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [fontsTick, setFontsTick] = useState(0);
  const stageRef = useRef(null);
  const baseRef = useRef(null);
  const overlayRef = useRef(null);
  const videoRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const flashTimer = useRef(null);

  const fit = fitChoice || (mediaRatio && mediaRatio < 0.75 ? "cover" : "contain");
  const f = STORY_FILTERS[filter];
  const edited = layers.length > 0 || strokes.length > 0 || filter > 0;

  useEffect(() => () => clearTimeout(flashTimer.current), []);
  // Each run makes its own link to the file and lets it go after.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let alive = true;
    if (isVideo) {
      if (videoRef.current) videoRef.current.src = url;
    } else {
      const im = new Image();
      im.onload = () => { if (alive) { setImg(im); setMediaRatio(im.naturalWidth / im.naturalHeight); } };
      im.onerror = () => { if (alive) setError("This photo couldn't be opened. Try another one."); };
      im.src = url;
    }
    return () => { alive = false; URL.revokeObjectURL(url); };
  }, [file, isVideo]);
  useEffect(() => { fontsReady([{ type: "text", style: "caption" }, { type: "text", style: "big" }]).then(() => setFontsTick((n) => n + 1)); }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The photo, at the stage's size; the filter is CSS on top, as posted.
  useEffect(() => {
    const c = baseRef.current;
    if (!c || !img || !stage.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(stage.w * dpr);
    c.height = Math.round(stage.h * dpr);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    drawPhoto(ctx, c.width, c.height, img, fit);
  }, [img, fit, stage]);

  // Text, stickers and drawing, drawn the way they'll be posted.
  const shown = useMemo(() => layers.filter((l) => l.id !== draft?.id), [layers, draft]);
  useEffect(() => {
    const c = overlayRef.current;
    if (!c || !stage.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(stage.w * dpr);
    c.height = Math.round(stage.h * dpr);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    drawOverlay(ctx, c.width, c.height, { strokes: live ? [...strokes, live] : strokes, layers: shown });
  }, [shown, strokes, live, stage, fontsTick]);

  // Boxes for dragging and for keyboard and screen reader users, measured the same way.
  const boxes = useMemo(() => {
    if (!stage.w) return new Map();
    const ctx = measure();
    return new Map(shown.map((l) => [l.id, l.type === "gif" ? { w: l.size * stage.w, h: l.size * stage.w * l.ratio } : drawLayer(ctx, stage.w, stage.h, l)]));
    // fontsTick re-measures once the fonts arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, stage, fontsTick]);

  // `patch` is fields, or a function of the layer as it is now.
  const update = useCallback((id, patch) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...(typeof patch === "function" ? patch(l) : patch) } : l))), []);
  const remove = useCallback((id) => { setLayers((ls) => ls.filter((l) => l.id !== id)); setSelected(null); }, []);
  const add = (layer) => {
    const id = newId(layer.type[0]);
    const size = layer.type === "info" && layer.kind === "stamp" ? SIZES.stamp : SIZES[layer.type] || 0.1;
    setLayers((ls) => [...ls, { x: 0.5, y: 0.42, rot: 0, size, ...layer, id }]);
    setSelected(id);
    setTool(null);
  };

  const showFilter = useCallback((i) => {
    setFilter(i);
    setFlash(STORY_FILTERS[i].name);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 900);
  }, []);
  const stepFilter = (d) => showFilter((filter + d + STORY_FILTERS.length) % STORY_FILTERS.length);

  const openText = (layer) => {
    setTool(null);
    setSelected(null);
    if (layer) setDraft({ id: layer.id, text: layer.text, style: layer.style, t: layer.t ?? 0 });
    else setDraft({ text: "", style: "caption", t: 0 });
  };
  const saveDraft = () => {
    const text = draft.text.replace(/\s+$/g, "").slice(0, 300);
    const color = colorAt(draft.t);
    if (draft.id) {
      if (text.trim()) update(draft.id, { text, style: draft.style, color, t: draft.t, ...(draft.style === "caption" ? { x: 0.5, rot: 0 } : {}) });
      else remove(draft.id);
    } else if (text.trim()) {
      const id = newId("t");
      setLayers((ls) => [...ls, { id, type: "text", text, style: draft.style, color, t: draft.t, x: 0.5, y: draft.style === "caption" ? 0.62 : 0.42, rot: 0, size: SIZES[draft.style] || 0.085 }]);
      setSelected(id);
    }
    setDraft(null);
  };

  // Pointers on the stage: drag and pinch layers, draw, swipe for filters, tap to caption.
  const point = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
  };
  const pinchOf = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const onDown = (e) => {
    if (draft || busy) return;
    try { stageRef.current.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = point(e);
    if (tool === "draw") {
      if (pointers.current.size === 1) setLive({ color: colorAt(ink), width: BRUSHES[brush], points: [[p.x, p.y]] });
      return;
    }
    const g = gesture.current;
    if (pointers.current.size === 2 && g?.kind === "layer") {
      const l = layers.find((x) => x.id === g.id);
      if (l && !(l.type === "text" && l.style === "caption")) gesture.current = { ...g, kind: "pinch", start: pinchOf(), size: l.size, rot: l.rot || 0 };
      return;
    }
    if (pointers.current.size > 1) return;
    const id = e.target.closest?.("[data-layer]")?.dataset.layer;
    if (id) {
      const l = layers.find((x) => x.id === id);
      gesture.current = { kind: "layer", id, sx: p.x, sy: p.y, x0: l.x, y0: l.y, moved: false };
      setSelected(id);
    } else {
      gesture.current = { kind: "swipe", sx: e.clientX, sy: e.clientY, moved: false };
    }
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = point(e);
    if (tool === "draw") {
      if (live) setLive((s) => ({ ...s, points: [...s.points, [clamp(p.x, 0, 1), clamp(p.y, 0, 1)]] }));
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const now = pinchOf();
      const l = layers.find((x) => x.id === g.id);
      update(g.id, { size: clamp(g.size * (now.d / g.start.d), l?.type === "gif" ? 0.12 : 0.025, 1.2), rot: g.rot + (now.a - g.start.a) });
      return;
    }
    if (g.kind === "layer") {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 0.01) return;
      g.moved = true;
      const l = layers.find((x) => x.id === g.id);
      const caption = l?.type === "text" && l.style === "caption";
      update(g.id, { x: caption ? 0.5 : clamp(g.x0 + dx, 0, 1), y: clamp(g.y0 + dy, 0.03, 0.97) });
      // The bin sits bottom centre while dragging.
      const over = Math.hypot((p.x - 0.5) * p.r.width, (p.y - 0.9) * p.r.height) < 48;
      setDragging((d) => (d?.over === over ? d : { over }));
      return;
    }
    if (g.kind === "swipe" && Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) g.moved = true;
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (tool === "draw") {
      if (live) { setStrokes((s) => [...s, live]); setLive(null); }
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g.kind === "layer") {
      if (dragging?.over) remove(g.id);
      else if (!g.moved) {
        const l = layers.find((x) => x.id === g.id);
        if (l?.type === "text") openText(l);
      }
      setDragging(null);
      return;
    }
    if (g.kind === "swipe") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepFilter(dx < 0 ? 1 : -1);
      else if (!g.moved) {
        if (selected) setSelected(null);
        else if (!tool) openText(null);
      }
    }
  };

  // Scroll to resize a selected layer on a computer; Shift + scroll rotates.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!selected) return;
      const l = layers.find((x) => x.id === selected);
      if (!l || (l.type === "text" && l.style === "caption")) return;
      e.preventDefault();
      if (e.shiftKey) update(selected, (x) => ({ rot: (x.rot || 0) + e.deltaY * 0.004 }));
      else update(selected, (x) => ({ size: clamp(x.size * Math.exp(-e.deltaY * 0.0015), x.type === "gif" ? 0.12 : 0.025, 1.2) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selected, layers, update]);
  // React doesn't keep a video's muted property in step after it mounts.
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  const layerKeys = (e, l) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const caption = l.type === "text" && l.style === "caption";
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      update(l.id, (x) => ({ x: caption ? 0.5 : clamp(x.x + dx, 0, 1), y: clamp(x.y + dy, 0.03, 0.97) }));
    } else if ((e.key === "+" || e.key === "=" || e.key === "-") && !caption) {
      e.preventDefault();
      update(l.id, (x) => ({ size: clamp(x.size * (e.key === "-" ? 0.9 : 1.1), 0.025, 1.2) }));
    } else if ((e.key === "[" || e.key === "]") && !caption) {
      e.preventDefault();
      update(l.id, (x) => ({ rot: (x.rot || 0) + (e.key === "[" ? -0.1 : 0.1) }));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(l.id);
    } else if (e.key === "Enter" && l.type === "text") {
      e.preventDefault();
      openText(l);
    }
  };

  // Escape closes what's open, one thing at a time.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || discarding) return;
      e.stopPropagation();
      if (draft) saveDraft();
      else if (tool) setTool(null);
      else if (selected) setSelected(null);
      else if (edited) setDiscarding(true);
      else onBack();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // The story as it will be posted (photos), or the see-through layer over it (videos).
  const render = async ({ withGifs = false, overlayOnly = false } = {}) => {
    await fontsReady(layers);
    const c = document.createElement("canvas");
    c.width = FRAME_W;
    c.height = FRAME_H;
    const ctx = c.getContext("2d");
    if (!overlayOnly) {
      drawPhoto(ctx, FRAME_W, FRAME_H, img, fit);
      applyFilter(ctx, FRAME_W, FRAME_H, f.id);
    }
    drawOverlay(ctx, FRAME_W, FRAME_H, { strokes, layers });
    // GIFs are animated in stories; a copy for elsewhere gets their first frame.
    if (withGifs) {
      for (const l of layers.filter((x) => x.type === "gif")) {
        const g = await new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = l.url; });
        if (!g) continue;
        const w = l.size * FRAME_W;
        ctx.save();
        ctx.translate(l.x * FRAME_W, l.y * FRAME_H);
        ctx.rotate(l.rot || 0);
        ctx.drawImage(g, -w / 2, (-w * l.ratio) / 2, w, w * l.ratio);
        ctx.restore();
      }
    }
    return c;
  };
  const toFile = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(new File([b], `mesh-story-${Date.now()}.jpg`, { type: "image/jpeg" })) : rej(new Error("export"))), "image/jpeg", 0.9));

  const words = layers.filter((l) => l.type === "text").map((l) => l.text).join("\n");
  const finish = async (action) => {
    if (busy) return;
    setError("");
    if (words.trim()) {
      const verdict = checkContent(words, { key: "story", skipCooldown: true });
      if (verdict.error) { setError(verdict.error); return; }
    }
    setBusy(action);
    try {
      if (action === "post") {
        onSendToPost(isVideo ? file : await toFile(await render({ withGifs: true })));
        return;
      }
      if (action === "save") {
        const out = await toFile(await render({ withGifs: true }));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(out);
        a.download = out.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setBusy("");
        return;
      }
      const gifs = layers.filter((l) => l.type === "gif").slice(0, MAX_GIFS)
        .map((l) => ({ url: l.url, x: round(l.x), y: round(l.y), w: round(l.size), r: round(l.rot || 0), ratio: round(l.ratio) }));
      const base = { fit, gifs, text: words, audience };
      if (isVideo) {
        const drawn = strokes.length > 0 || layers.some((l) => l.type !== "gif");
        onPost({ ...base, kind: "video", file, overlay: drawn ? await render({ overlayOnly: true }) : null, filter: f.id, muted });
      } else {
        onPost({ ...base, kind: "image", file: await toFile(await render()), seconds });
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't finish your story. Try again, or remove a sticker.");
      setBusy("");
    }
  };

  const sel = layers.find((l) => l.id === selected) || null;
  const selCaption = sel?.type === "text" && sel.style === "caption";
  const draftStyle = draft && draft.style;
  const draftPx = draft ? (draftStyle === "caption" ? CAPTION_SIZE : 0.085) * (stage.w || 360) : 0;
  const ready = isVideo ? !!mediaRatio : !!img;
  const gifCount = layers.filter((l) => l.type === "gif").length;

  return createPortal(
    <div ref={trap} role="dialog" aria-modal="true" aria-label="Edit your story" data-theme="dark"
      onClickCapture={settled ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); }}
      className="fixed inset-0 z-sheet flex flex-col bg-black text-white anim-fade">
      <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
        <div className="flex h-full w-full items-center justify-center md:py-4">
          <div ref={stageRef} className="relative overflow-hidden bg-black md:rounded-sheet"
            style={{ width: "min(100cqw, calc(100cqh * 9 / 16))", aspectRatio: "9 / 16", touchAction: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {isVideo ? (
              <video ref={videoRef} autoPlay loop playsInline muted={muted} aria-label="Your video"
                onLoadedMetadata={(e) => { setMediaRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 9 / 16); e.currentTarget.play().catch(() => { e.currentTarget.muted = true; e.currentTarget.play().catch(() => {}); }); }}
                onError={() => setError("This video couldn't be opened. Try an MP4 or MOV.")}
                className="pointer-events-none absolute inset-0 h-full w-full" style={{ objectFit: fit, filter: f.css || undefined }} />
            ) : (
              <canvas ref={baseRef} role="img" aria-label="Your photo" className="pointer-events-none absolute inset-0 h-full w-full" style={{ filter: f.css || undefined }} />
            )}
            {f.vignette && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: vignetteCss(f.vignette) }} />}
            <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

            {/* GIFs stay animated; everything else is drawn above, with these boxes to grab. */}
            {shown.map((l) => {
              const box = boxes.get(l.id) || { w: 40, h: 40 };
              const caption = l.type === "text" && l.style === "caption";
              const name = l.type === "text" ? `Text: ${l.text}` : l.type === "emoji" ? `Sticker ${l.char}` : l.type === "gif" ? "GIF sticker" : `${l.label} sticker`;
              return (
                <button key={l.id} type="button" data-layer={l.id} aria-label={`${name}. Drag to move${l.type === "text" ? ", tap to edit" : ""}`}
                  onKeyDown={(e) => layerKeys(e, l)} onFocus={() => setSelected(l.id)}
                  className={`absolute rounded-[6px] ${selected === l.id ? "outline outline-2 outline-offset-2 outline-white/80" : ""}`}
                  style={{
                    left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: box.w, height: box.h, touchAction: "none",
                    transform: `translate(-50%, -50%) rotate(${caption ? 0 : l.rot || 0}rad)`,
                  }}>
                  {l.type === "gif" && <img src={l.url} alt="" draggable={false} className="pointer-events-none h-full w-full" />}
                </button>
              );
            })}

            {!ready && !error && <span className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Opening"><Spinner /></span>}
            {flash && (
              <p className={`pointer-events-none absolute inset-x-0 top-[42%] text-center font-display text-title-1 font-extrabold drop-shadow-lg ${motionReduced() ? "" : "anim-fade"}`} aria-live="polite">
                {flash}
              </p>
            )}
            {dragging && (
              <span aria-hidden="true" className={`pointer-events-none absolute bottom-[6%] left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full transition-all ${dragging.over ? "scale-125 bg-danger" : "bg-black/50 ring-2 ring-white/70"}`}>
                <Trash2 size={22} />
              </span>
            )}
          </div>
        </div>

        {/* Top: back, and the tools down the right, like Snapchat. */}
        {!draft && (
          <>
            <div className="absolute left-0 top-0 flex items-center gap-1 px-2 pt-safe">
              {tool === "draw" ? (
                <Button size="sm" variant="primary" icon={Check} className="mt-2" onClick={() => setTool(null)}>Done</Button>
              ) : (
                <button type="button" onClick={() => (edited ? setDiscarding(true) : onBack())}
                  className="press mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-black/35 px-3 text-callout font-semibold">
                  {backLabel === "Retake" ? <ArrowLeft size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />} {backLabel}
                </button>
              )}
            </div>
            {tool === "draw" ? (
              <div className="absolute right-2 top-0 flex flex-col items-center gap-3 pt-safe">
                <div className="mt-2 flex flex-col items-center gap-2">
                  <RailButton icon={Undo2} label="Undo" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))} />
                  <div role="radiogroup" aria-label="Brush size" className="flex flex-col items-center gap-1 rounded-full bg-black/35 py-1.5">
                    {BRUSHES.map((b, i) => (
                      <button key={b} type="button" role="radio" aria-checked={brush === i} aria-label={["Thin", "Medium", "Thick"][i]} onClick={() => setBrush(i)}
                        className="flex h-9 w-9 items-center justify-center">
                        <span className={`rounded-full ${brush === i ? "ring-2 ring-white" : ""}`} style={{ width: 6 + i * 6, height: 6 + i * 6, background: colorAt(ink) }} />
                      </button>
                    ))}
                  </div>
                </div>
                <ColorSlider value={ink} onChange={setInk} />
              </div>
            ) : (
              <div role="toolbar" aria-label="Story tools" aria-orientation="vertical" className="absolute right-1 top-0 flex flex-col items-center gap-1 pt-safe">
                <div className="mt-2" />
                <RailButton icon={Type} label="Text" onClick={() => openText(null)} />
                <RailButton icon={Pencil} label="Draw" onClick={() => { setSelected(null); setTool("draw"); }} />
                <RailButton icon={Sticker} label="Stickers" onClick={() => { setSelected(null); setTool("stickers"); }} />
                <RailButton icon={Sparkles} label={filter ? f.name : "Filters"} active={filter > 0} onClick={() => stepFilter(1)} />
                <RailButton icon={fit === "cover" ? Minimize : Maximize} label={fit === "cover" ? "Fit" : "Fill"} onClick={() => setFitChoice(fit === "cover" ? "contain" : "cover")} />
                {!isVideo && (
                  <RailButton icon={Timer} label={`${seconds}s`} onClick={() => setSeconds(PHOTO_SECONDS[(PHOTO_SECONDS.indexOf(seconds) + 1) % PHOTO_SECONDS.length])} />
                )}
                {isVideo && <RailButton icon={muted ? VolumeX : Volume2} label={muted ? "Muted" : "Sound"} active={muted} onClick={() => setMuted((m) => !m)} />}
                {!isVideo && <RailButton icon={Download} label="Save" disabled={!img || !!busy} onClick={() => finish("save")} />}
              </div>
            )}
          </>
        )}

        {/* Typing: the text sits where it will, in its style. */}
        {draft && (
          <div className="absolute inset-0 z-20 flex flex-col bg-black/55" role="dialog" aria-modal="true" aria-label="Add text">
            <div className="flex items-center justify-between px-2 pt-safe">
              <button type="button" onClick={() => setDraft((d) => ({ ...d, style: TEXT_STYLES[(TEXT_STYLES.findIndex((s) => s.id === d.style) + 1) % TEXT_STYLES.length].id }))}
                className="press mt-2 flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-callout font-semibold"
                aria-label={`Text style: ${TEXT_STYLES.find((s) => s.id === draft.style).name}. Tap for the next style`}>
                <span className="font-display font-extrabold">Aa</span> {TEXT_STYLES.find((s) => s.id === draft.style).name}
              </button>
              <Button size="sm" variant="primary" icon={Check} className="mt-2" onClick={saveDraft}>Done</Button>
            </div>
            <div className="relative flex flex-1 items-center justify-center">
              <label htmlFor="story-text" className="sr-only">Your text</label>
              <textarea id="story-text" autoFocus rows={draftStyle === "caption" ? 1 : 3} value={draft.text} maxLength={300}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveDraft(); } }}
                placeholder={draftStyle === "caption" ? "Add a caption" : "Type something"}
                className="w-full resize-none text-center outline-none placeholder:text-white/50"
                style={{
                  font: fontFor(draftStyle, draftPx), lineHeight: draftStyle === "caption" ? 1.3 : 1.15,
                  color: draftStyle === "glow" ? "#fff" : draftStyle === "label" ? "#fff" : colorAt(draft.t),
                  background: draftStyle === "caption" ? "rgba(0,0,0,0.6)" : draftStyle === "label" ? colorAt(draft.t) : "transparent",
                  textShadow: draftStyle === "glow" ? `0 0 ${draftPx * 0.4}px ${colorAt(draft.t)}` : draftStyle === "big" ? "0 0 6px rgba(0,0,0,.5)" : "none",
                  padding: draftStyle === "caption" ? `${draftPx * 0.35}px 5%` : draftStyle === "label" ? "4px 16px" : "0 7%",
                  borderRadius: draftStyle === "label" ? 14 : 0,
                  maxWidth: draftStyle === "label" ? "86%" : "100%",
                }} />
              <ColorSlider value={draft.t} onChange={(t) => setDraft((d) => ({ ...d, t }))} className="absolute right-3 top-4" />
            </div>
            <p className="pb-safe text-center text-caption text-white/70"><span className="block pb-3">Enter to finish · Shift + Enter for a new line</span></p>
          </div>
        )}

        {tool === "stickers" && (
          <StickerSheet onClose={() => setTool(null)} onPick={add}
            onGif={() => setTool(gifCount >= MAX_GIFS ? "stickers" : "gif")} />
        )}
        {tool === "gif" && (
          <Suspense fallback={null}>
            <GifPicker onClose={() => setTool(null)} onPick={(g) => add({ type: "gif", url: g.url, ratio: g.height / g.width || 1 })} />
          </Suspense>
        )}
      </div>

      {/* Bottom: the selected sticker's controls, then who sees it and post.
          Hidden, not removed, while typing or drawing, so the photo doesn't jump. */}
        <div className={`shrink-0 px-3 pb-safe ${draft || tool === "draw" ? "invisible" : ""}`} aria-hidden={draft || tool === "draw" ? true : undefined}>
          {sel && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2" role="group" aria-label="Selected sticker">
              {!selCaption && <MiniButton icon={Minus} label="Smaller" iconOnly onClick={() => update(sel.id, { size: clamp(sel.size * 0.88, 0.025, 1.2) })} />}
              {!selCaption && <MiniButton icon={Plus} label="Bigger" iconOnly onClick={() => update(sel.id, { size: clamp(sel.size * 1.12, 0.025, 1.2) })} />}
              {!selCaption && <MiniButton icon={RotateCw} label="Turn" onClick={() => update(sel.id, { rot: (sel.rot || 0) + Math.PI / 12 })} />}
              {sel.type === "text" && <MiniButton icon={Type} label="Edit" onClick={() => openText(sel)} />}
              <MiniButton icon={Trash2} label="Remove" onClick={() => remove(sel.id)} />
            </div>
          )}
          {error && <div className="mx-auto max-w-md pt-2"><InlineMessage>{error}</InlineMessage></div>}
          {!sel && !error && ready && (
            <p className="pt-2 text-center text-caption text-white/60">
              {gifCount >= MAX_GIFS && tool === "stickers" ? `Up to ${MAX_GIFS} GIFs on a story.` : "Tap to add a caption · swipe for filters · pinch or scroll to resize"}
            </p>
          )}
          <div className="mx-auto flex max-w-md items-center gap-2 py-3">
            <button type="button" onClick={() => !privateAccount && setAudience((a) => (a === "public" ? "followers" : "public"))}
              aria-label={`Who can see it: ${audience === "public" ? "everyone" : "followers"}${privateAccount ? ". Your account is private, so only followers" : ". Tap to change"}`}
              className="press flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-callout font-semibold">
              {audience === "public" ? <Globe size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              {audience === "public" ? "Everyone" : "Followers"}
            </button>
            <span className="flex-1" />
            {onSendToPost && (
              <Button size="lg" variant="secondary" className="!bg-white/15 !text-white" loading={busy === "post"} disabled={!ready || !!busy} onClick={() => finish("post")}>
                Post
              </Button>
            )}
            <Button size="lg" variant="primary" icon={Send} loading={busy === "story"} disabled={!ready || !!busy} onClick={() => finish("story")}>
              Your story
            </Button>
          </div>
        </div>

      {discarding && (
        <ConfirmDialog title="Discard this story?" body="Your text, drawing and stickers will be lost." confirmLabel="Discard"
          onClose={() => setDiscarding(false)} onConfirm={() => { setDiscarding(false); onBack(); }} />
      )}
    </div>,
    document.body,
  );
}

const round = (n) => Math.round(n * 10000) / 10000;

function RailButton({ icon: Icon, label, onClick, active = false, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active || undefined}
      className="press flex w-14 flex-col items-center gap-0.5 rounded-control py-1 text-white disabled:opacity-40">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${active ? "bg-white text-black" : "bg-black/35"}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="text-[11px] font-semibold leading-tight drop-shadow" aria-hidden="true">{label}</span>
    </button>
  );
}

function MiniButton({ icon: Icon, label, onClick, iconOnly = false }) {
  return (
    <button type="button" onClick={onClick} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined}
      className={`press flex min-h-9 items-center gap-1.5 rounded-full bg-white/15 text-caption font-semibold ${iconOnly ? "w-9 justify-center" : "px-3"}`}>
      <Icon size={15} aria-hidden="true" />{!iconOnly && ` ${label}`}
    </button>
  );
}
