import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Crosshair } from "lucide-react";
import Dialog from "./Dialog";
import Button from "./Button";

const OUT = 720; // output size (px)
const MAX_ZOOM = 4;

// Square crop with pan (drag/arrow keys) and zoom (pinch/wheel/slider/+ -).
export default function PhotoCropper({ file, shape = "circle", title = "Adjust your photo", onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image centre offset from frame centre (px)
  const [busy, setBusy] = useState(false);
  const frameRef = useRef(null);
  const [frame, setFrame] = useState(300);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg(el);
    el.onerror = () => setFailed(true);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrame(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  // zoom 1 = cover.
  const cover = img ? frame / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = cover * zoom;
  const dispW = img ? img.naturalWidth * scale : frame;
  const dispH = img ? img.naturalHeight * scale : frame;
  // Clamp so the image always covers the frame.
  const clamp = (p, z = zoom) => {
    if (!img) return p;
    const s = cover * z;
    const mx = Math.max(0, (img.naturalWidth * s - frame) / 2);
    const my = Math.max(0, (img.naturalHeight * s - frame) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const zoomTo = (z) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    // Zoom around the frame centre.
    setPos((p) => clamp({ x: (p.x * next) / zoom, y: (p.y * next) / zoom }, next));
    setZoom(next);
  };
  const centre = () => { setZoom(1); setPos({ x: 0, y: 0 }); };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current) zoomTo(gesture.current.zoom * (dist / gesture.current.dist));
      else gesture.current = { dist, zoom };
      return;
    }
    setPos((p) => clamp({ x: p.x + (e.clientX - prev.x), y: p.y + (e.clientY - prev.y) }));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };
  const onWheel = (e) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 30 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); setPos((p) => clamp({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] })); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(zoom + 0.2); }
    if (e.key === "-") { e.preventDefault(); zoomTo(zoom - 0.2); }
  };
  // React registers wheel listeners as passive; preventDefault needs a native one.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      // Frame rect in source-image pixels.
      const left = frame / 2 + pos.x - dispW / 2;
      const top = frame / 2 + pos.y - dispH / 2;
      const side = frame / scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -left / scale, -top / scale, side, side, 0, 0, OUT, OUT);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      await onDone(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } finally {
      setBusy(false);
    }
  };

  const round = shape === "circle" ? "rounded-full" : "rounded-[22%]";
  return (
    <Dialog title={title} onClose={onCancel} variant="center" size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!img}>Use photo</Button>
        </div>
      )}>
      {failed ? (
        <p className="text-callout text-danger-text">That image couldn&apos;t be opened. Try another.</p>
      ) : (
        <>
          <p className="mb-3 text-caption text-fg-muted">Drag to position it. Pinch, scroll or use the slider to zoom.</p>
          <div ref={frameRef} tabIndex={0} role="application"
            aria-label="Photo position. Arrow keys move it; plus and minus zoom."
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-card bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing">
            {img ? (
              <img src={img.src} alt="" draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{ width: dispW, height: dispH, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
            ) : (
              <span className="skeleton absolute inset-0" aria-hidden="true" />
            )}
            <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${round} ring-2 ring-white/80`}
              style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }} />
          </div>
          <div className="mx-auto mt-4 flex max-w-[320px] items-center gap-3">
            <button type="button" onClick={() => zoomTo(zoom - 0.25)} aria-label="Zoom out" className="press rounded-full p-1.5 text-fg-muted hover:text-fg"><Minus size={18} /></button>
            <label htmlFor="crop-zoom" className="sr-only">Zoom</label>
            <input id="crop-zoom" type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom}
              onChange={(e) => zoomTo(Number(e.target.value))} className="min-w-0 flex-1 accent-[rgb(var(--accent))]" />
            <button type="button" onClick={() => zoomTo(zoom + 0.25)} aria-label="Zoom in" className="press rounded-full p-1.5 text-fg-muted hover:text-fg"><Plus size={18} /></button>
            <button type="button" onClick={centre} className="press inline-flex items-center gap-1 rounded-full px-2 py-1 text-caption font-semibold text-fg-muted hover:text-fg">
              <Crosshair size={14} aria-hidden="true" /> Centre
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
