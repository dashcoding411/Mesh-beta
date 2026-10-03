import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Type, SlidersHorizontal, Sticker, Trash2, RotateCw, Check } from "lucide-react";
import { gifsEnabled } from "../lib/gifs";
import Button from "./ui/Button";
import { Spinner } from "./ui/States";

const GifPicker = lazy(() => import("./GifPicker"));

const COLORS = [["#ffffff", "White"], ["#09090b", "Black"], ["#a78bfa", "Purple"], ["#f472b6", "Pink"],
  ["#facc15", "Yellow"], ["#34d399", "Green"], ["#38bdf8", "Blue"], ["#f87171", "Red"]];
const FONT = '800 {px}px "Plus Jakarta Sans Variable", "Inter Variable", system-ui, sans-serif';
const MAX_SIDE = 2160;

function loadImage(src, cors = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The base photo: rotated, zoomed and moved, filling a W x H frame.
function drawBase(ctx, W, H, img, { rot, zoom, px, py }) {
  const sideways = rot % 180 !== 0;
  const dw = sideways ? H : W;
  const dh = sideways ? W : H;
  ctx.save();
  ctx.translate(W / 2 + px * W, H / 2 + py * H);
  ctx.scale(zoom, zoom);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

// Brightness, contrast and saturation, the same maths as the CSS preview.
function applyTone(ctx, W, H, { brightness, contrast, saturation }) {
  if (brightness === 1 && contrast === 1 && saturation === 1) return;
  const data = ctx.getImageData(0, 0, W, H);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * brightness, g = d[i + 1] * brightness, b = d[i + 2] * brightness;
    r = (r - 128) * contrast + 128; g = (g - 128) * contrast + 128; b = (b - 128) * contrast + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    d[i] = l + (r - l) * saturation; d[i + 1] = l + (g - l) * saturation; d[i + 2] = l + (b - l) * saturation;
  }
  ctx.putImageData(data, 0, 0);
}

function drawText(ctx, W, layer) {
  const px = layer.size * W;
  ctx.font = FONT.replace("{px}", px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = layer.text.split("\n");
  const lineH = px * 1.15;
  const top = layer.y * (ctx.canvas.height) - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => {
    const x = layer.x * W;
    const y = top + i * lineH;
    if (layer.pill) {
      const w = ctx.measureText(line).width + px * 0.6;
      ctx.fillStyle = layer.color === "#ffffff" ? "rgba(0,0,0,0.7)" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect?.(x - w / 2, y - lineH / 2, w, lineH, lineH * 0.3);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = px * 0.15;
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;
  });
}

/**
 * Edit a photo before it posts: text, GIF stickers, zoom and rotate, and
 * tone. Calls onDone(actionId, file) with the flattened image.
 */
export default function PhotoEditor({ file, actions, onBack, onDone }) {
  const [img, setImg] = useState(null);
  const [tool, setTool] = useState(null); // null | "text" | "adjust" | "gif"
  const [base, setBase] = useState({ rot: 0, zoom: 1, px: 0, py: 0, brightness: 1, contrast: 1, saturation: 1 });
  const [layers, setLayers] = useState([]); // { id, type: "text"|"gif", x, y, size, text?, color?, pill?, url?, ratio? }
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null); // text being typed: { id?, text, color, pill }
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [stageW, setStageW] = useState(300);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    loadImage(url).then(setImg).catch(() => setError("This photo couldn't be opened."));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Text and stickers are sized against the stage, as they will be exported.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setStageW(entry.contentRect.width || 300));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const sideways = base.rot % 180 !== 0;
  const ratio = img ? (sideways ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight) : 9 / 16;

  // Live preview of the base photo.
  useEffect(() => {
    const c = canvasRef.current;
    const stage = stageRef.current;
    if (!c || !img || !stage) return;
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    drawBase(ctx, c.width, c.height, img, base);
  }, [img, base, ratio]);

  const update = (id, patch) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const sel = layers.find((l) => l.id === selected) || null;

  // Drag layers (and the photo itself while adjusting).
  const startDrag = (e, id) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = stageRef.current.getBoundingClientRect();
    const start = id === "base" ? { x: base.px, y: base.py } : (() => { const l = layers.find((x) => x.id === id); return { x: l.x, y: l.y }; })();
    drag.current = { id, sx: e.clientX, sy: e.clientY, w: r.width, h: r.height, start, moved: false };
    if (id !== "base") setSelected(id);
  };
  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.w;
    const dy = (e.clientY - d.sy) / d.h;
    if (Math.abs(dx) + Math.abs(dy) > 0.005) d.moved = true;
    if (d.id === "base") {
      const lim = (base.zoom - 1) / 2;
      setBase((b) => ({ ...b, px: Math.max(-lim, Math.min(lim, d.start.x + dx)), py: Math.max(-lim, Math.min(lim, d.start.y + dy)) }));
    } else {
      update(d.id, { x: Math.max(0, Math.min(1, d.start.x + dx)), y: Math.max(0, Math.min(1, d.start.y + dy)) });
    }
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    // A tap (not a drag) on text opens it for editing.
    if (d && !d.moved && d.id !== "base") {
      const l = layers.find((x) => x.id === d.id);
      if (l?.type === "text") setDraft({ id: l.id, text: l.text, color: l.color, pill: l.pill });
    }
  };
  const nudge = (e, id) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (m) {
      e.preventDefault();
      const l = layers.find((x) => x.id === id);
      update(id, { x: Math.max(0, Math.min(1, l.x + m[0])), y: Math.max(0, Math.min(1, l.y + m[1])) });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setLayers((ls) => ls.filter((x) => x.id !== id));
      setSelected(null);
    }
  };

  const saveDraft = () => {
    const text = draft.text.trim();
    if (draft.id) {
      if (text) update(draft.id, { text, color: draft.color, pill: draft.pill });
      else setLayers((ls) => ls.filter((l) => l.id !== draft.id));
    } else if (text) {
      const id = `t${Date.now()}`;
      setLayers((ls) => [...ls, { id, type: "text", text, color: draft.color, pill: draft.pill, x: 0.5, y: 0.45, size: 0.08 }]);
      setSelected(id);
    }
    setDraft(null);
  };

  const finish = async (actionId) => {
    if (!img) return;
    setBusy(actionId);
    setError("");
    try {
      const longSide = Math.min(MAX_SIDE, Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(ratio >= 1 ? longSide : longSide * ratio);
      const H = Math.round(ratio >= 1 ? longSide / ratio : longSide);
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      drawBase(ctx, W, H, img, base);
      applyTone(ctx, W, H, base);
      for (const l of layers) {
        if (l.type === "text") drawText(ctx, W, l);
        else {
          const g = await loadImage(l.url, true).catch(() => null);
          if (!g) continue;
          const w = l.size * W;
          ctx.drawImage(g, l.x * W - w / 2, l.y * H - (w * l.ratio) / 2, w, w * l.ratio);
        }
      }
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("export");
      onDone(actionId, new File([blob], `mesh-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch {
      setError("Couldn't finish the photo. Try again, or remove the sticker.");
      setBusy("");
    }
  };

  const tone = `brightness(${base.brightness}) contrast(${base.contrast}) saturate(${base.saturation})`;

  return (
    <div className="absolute inset-0 flex flex-col bg-black text-white">
      {/* Top: back and tools */}
      <div className="z-10 flex shrink-0 items-center gap-1 px-2 pb-2 pt-safe">
        <button type="button" onClick={onBack} className="press flex min-h-11 items-center gap-1.5 rounded-full px-3 text-callout font-semibold">
          <ArrowLeft size={20} aria-hidden="true" /> Retake
        </button>
        <span className="flex-1" />
        <div role="toolbar" aria-label="Edit the photo" className="flex gap-1">
          <ToolButton icon={Type} label="Add text" active={!!draft} onClick={() => { setTool(null); setDraft({ text: "", color: "#ffffff", pill: false }); }} />
          <ToolButton icon={SlidersHorizontal} label="Adjust" active={tool === "adjust"} onClick={() => setTool(tool === "adjust" ? null : "adjust")} />
          {gifsEnabled && <ToolButton icon={Sticker} label="Add a GIF" active={tool === "gif"} onClick={() => setTool("gif")} />}
        </div>
      </div>

      {/* The photo */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onPointerDown={() => setSelected(null)}>
        {!img && !error && <Spinner />}
        {img && (
          <div ref={stageRef} className="relative max-h-full max-w-full overflow-hidden rounded-card" style={{ aspectRatio: ratio, height: ratio < 1 ? "100%" : "auto", width: ratio >= 1 ? "100%" : "auto" }}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: tone, touchAction: "none" }}
              aria-label="Your photo" role="img"
              onPointerDown={(e) => { if (tool === "adjust" && base.zoom > 1) startDrag(e, "base"); }} />
            {layers.map((l) => (
              <button key={l.id} type="button" aria-label={l.type === "text" ? `Text: ${l.text}. Drag to move, tap to edit` : "GIF sticker. Drag to move"}
                onPointerDown={(e) => startDrag(e, l.id)} onKeyDown={(e) => nudge(e, l.id)} onFocus={() => setSelected(l.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 select-none whitespace-pre text-center leading-[1.15] ${selected === l.id ? "outline outline-2 outline-offset-4 outline-white/80" : ""}`}
                style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, touchAction: "none" }}>
                {l.type === "text" ? (
                  <StageText layer={l} width={stageW} />
                ) : (
                  <img src={l.url} alt="" draggable={false} className="pointer-events-none"
                    style={{ width: `${l.size * stageW}px` }} />
                )}
              </button>
            ))}
          </div>
        )}
        {error && <p className="absolute inset-x-6 bottom-4 rounded-control bg-danger/90 px-3 py-2 text-center text-callout" role="alert">{error}</p>}
      </div>

      {/* Controls for what's selected */}
      <div className="z-10 shrink-0 px-4 pb-safe">
        {tool === "adjust" && (
          <div className="space-y-2 pt-3">
            <Slider label="Zoom" min={1} max={3} step={0.01} value={base.zoom}
              onChange={(z) => setBase((b) => { const lim = (z - 1) / 2; return { ...b, zoom: z, px: Math.max(-lim, Math.min(lim, b.px)), py: Math.max(-lim, Math.min(lim, b.py)) }; })} />
            <Slider label="Brightness" min={0.5} max={1.5} step={0.01} value={base.brightness} onChange={(v) => setBase((b) => ({ ...b, brightness: v }))} />
            <Slider label="Contrast" min={0.5} max={1.5} step={0.01} value={base.contrast} onChange={(v) => setBase((b) => ({ ...b, contrast: v }))} />
            <Slider label="Saturation" min={0} max={2} step={0.01} value={base.saturation} onChange={(v) => setBase((b) => ({ ...b, saturation: v }))} />
            <div className="flex justify-between pt-1">
              <Button size="sm" className="!bg-white/15 !text-white" icon={RotateCw} onClick={() => setBase((b) => ({ ...b, rot: (b.rot + 90) % 360, px: 0, py: 0 }))}>Rotate</Button>
              <Button size="sm" variant="ghost" className="!text-white" onClick={() => setBase({ rot: 0, zoom: 1, px: 0, py: 0, brightness: 1, contrast: 1, saturation: 1 })}>Reset</Button>
            </div>
            {base.zoom > 1 && <p className="text-center text-caption text-white/70">Drag the photo to reposition it.</p>}
          </div>
        )}
        {!tool && sel && (
          <div className="space-y-2 pt-3">
            <Slider label="Size" min={sel.type === "text" ? 0.03 : 0.15} max={sel.type === "text" ? 0.2 : 0.9} step={0.005} value={sel.size}
              onChange={(v) => update(sel.id, { size: v })} />
            <div className="flex items-center gap-2">
              {sel.type === "text" && <Swatches value={sel.color} onChange={(color) => update(sel.id, { color })} />}
              <span className="flex-1" />
              <Button size="sm" className="!bg-white/15 !text-white" icon={Trash2}
                onClick={() => { setLayers((ls) => ls.filter((l) => l.id !== sel.id)); setSelected(null); }}>Remove</Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 py-4">
          {actions.map((a) => (
            <Button key={a.id} variant={a.primary ? "primary" : "secondary"} size="lg" loading={busy === a.id} disabled={!!busy || !img}
              className={a.primary ? "min-w-32" : "!bg-white/15 !text-white"} onClick={() => finish(a.id)}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Typing text */}
      {draft && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/75 px-4 pt-safe backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add text">
          <div className="flex items-center justify-between py-2">
            <button type="button" className="press min-h-11 rounded-full px-3 text-callout font-semibold"
              onClick={() => setDraft((d) => ({ ...d, pill: !d.pill }))} aria-pressed={draft.pill}>
              {draft.pill ? "Background on" : "Background off"}
            </button>
            <Button size="sm" variant="primary" icon={Check} onClick={saveDraft}>Done</Button>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <label htmlFor="editor-text" className="sr-only">Your text</label>
            <textarea id="editor-text" autoFocus rows={3} value={draft.text} maxLength={200}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Type something"
              className="w-full resize-none bg-transparent text-center font-display text-[2rem] font-extrabold leading-tight outline-none placeholder:text-white/40"
              style={{ color: draft.color }} />
          </div>
          <div className="pb-safe"><div className="flex justify-center pb-6"><Swatches value={draft.color} onChange={(color) => setDraft((d) => ({ ...d, color }))} /></div></div>
        </div>
      )}

      {tool === "gif" && (
        <Suspense fallback={null}>
          <GifPicker onClose={() => setTool(null)} onPick={(g) => {
            const id = `g${Date.now()}`;
            setLayers((ls) => [...ls, { id, type: "gif", url: g.url, ratio: g.height / g.width || 1, x: 0.5, y: 0.5, size: 0.4 }]);
            setSelected(id);
            setTool(null);
          }} />
        </Suspense>
      )}
    </div>
  );
}

// Text sized to the stage, as it will be exported.
function StageText({ layer, width }) {
  const px = layer.size * width;
  return (
    <span className="block font-display font-extrabold"
      style={{
        fontSize: px, color: layer.color,
        ...(layer.pill
          ? { background: layer.color === "#ffffff" ? "rgba(0,0,0,0.7)" : "#fff", padding: `0 ${px * 0.3}px`, borderRadius: px * 0.35 }
          : { textShadow: `0 0 ${px * 0.15}px rgba(0,0,0,0.45)` }),
      }}>
      {layer.text}
    </span>
  );
}

function ToolButton({ icon: Icon, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={`press flex h-11 w-11 items-center justify-center rounded-full ${active ? "bg-white text-black" : "bg-white/15"}`}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

function Slider({ label, min, max, step, value, onChange }) {
  const id = `edit-${label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-caption text-white/80">{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 flex-1 accent-white" />
    </div>
  );
}

function Swatches({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex gap-2">
      {COLORS.map(([c, name]) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={name} onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full border-2 ${value === c ? "border-white ring-2 ring-white/60" : "border-white/40"}`} style={{ background: c }} />
      ))}
    </div>
  );
}
