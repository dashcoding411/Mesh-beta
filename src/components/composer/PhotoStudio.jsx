import { useEffect, useRef, useState } from "react";
import { Aperture, Camera as CameraIcon, ChevronLeft, ChevronRight, Move, Plus, SlidersHorizontal, X } from "lucide-react";
import { MAX_SLIDES } from "../../lib/db";
import { SHAPES, frameRatio } from "../../lib/framing";
import { STORY_FILTERS, filterById, vignetteCss } from "../../lib/storyCanvas";
import IconButton from "../ui/IconButton";

const HOLD_MS = 280; // a touch held this long on a thumbnail picks it up to move
const STEP = 5; // % per arrow key when placing a photo in its frame

/**
 * The photo part of making a Still: the frame shape for the whole post, each
 * photo placed in it (drag it) with a filter, the editor for text and tone,
 * and the ordered strip. What's shown is what the feed will show; the crop
 * and filter are baked in at upload (lib/framing.js).
 */
export default function PhotoStudio({
  photos, active, onActive, shape, onShape, onChange, onApplyAll, busy,
  onRemove, onMove, onReorder, onAdd, onCamera, onRoll, onEdit,
}) {
  const current = photos[active] || photos[0];
  const ratio = frameRatio(shape, photos[0]?.w, photos[0]?.h);
  const look = filterById(current.filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Shape of the post" className="inline-flex rounded-control bg-surface-2 p-1">
          {SHAPES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={shape === s.id} onClick={() => onShape(s.id)}
              className={`min-h-9 rounded-[9px] px-3 text-caption font-semibold ${shape === s.id ? "bg-surface-3 text-fg shadow-raised" : "text-fg-subtle hover:text-fg-muted"}`}>
              {s.label}
            </button>
          ))}
        </div>
        {!busy && (
          <button type="button" onClick={() => onEdit(active)}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-caption font-semibold hover:bg-surface-3">
            <SlidersHorizontal size={15} aria-hidden="true" /> Edit photo
          </button>
        )}
      </div>

      <Frame photo={current} ratio={ratio} look={look} index={active} count={photos.length}
        onPlace={(x, y) => onChange(current.id, { x, y })}
        onSize={(id, w, h) => onChange(id, { w, h })}
        onPrev={active > 0 ? () => onActive(active - 1) : null}
        onNext={active < photos.length - 1 ? () => onActive(active + 1) : null} />

      <Filters photo={current} onPick={(id) => onChange(current.id, { filter: id })}
        onApplyAll={photos.length > 1 ? () => onApplyAll(current.filter) : null} />

      <Strip photos={photos} active={active} onActive={onActive} busy={busy} onRemove={onRemove} onMove={onMove}
        onReorder={onReorder} onAdd={onAdd} onCamera={onCamera} onRoll={onRoll} />
    </div>
  );
}

// The photo in its frame, as the feed will show it. Drag it (or use the
// arrow keys) to choose which part is in the frame.
function Frame({ photo, ratio, look, index, count, onPlace, onSize, onPrev, onNext }) {
  const box = useRef(null);
  const drag = useRef(null);
  const fits = photo.w && photo.h ? Math.abs(photo.h / photo.w - ratio) < 1e-3 : true;
  const tall = photo.w && photo.h ? photo.h / photo.w > ratio : false;

  const down = (e) => {
    if (fits || e.button > 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* works without */ }
    drag.current = { x0: e.clientX, y0: e.clientY, px: photo.x, py: photo.y };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const { width: fw, height: fh } = box.current.getBoundingClientRect();
    // The photo's spare length past the frame, on the side it's cut.
    const spare = tall ? fw * (photo.h / photo.w) - fh : fh * (photo.w / photo.h) - fw;
    if (spare <= 0) return;
    const clamp = (v) => Math.max(0, Math.min(100, v));
    if (tall) onPlace(d.px, clamp(d.py - ((e.clientY - d.y0) / spare) * 100));
    else onPlace(clamp(d.px - ((e.clientX - d.x0) / spare) * 100), d.py);
  };
  const up = () => { drag.current = null; };
  const key = (e) => {
    if (fits) return;
    const by = { ArrowUp: [0, -STEP], ArrowDown: [0, STEP], ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0] }[e.key];
    if (!by) return;
    e.preventDefault();
    onPlace(Math.max(0, Math.min(100, photo.x + by[0])), Math.max(0, Math.min(100, photo.y + by[1])));
  };

  return (
    <div className="relative">
      <div ref={box} tabIndex={fits ? -1 : 0} onKeyDown={key}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        aria-label={fits ? undefined : "Photo in its frame. Drag it, or use the arrow keys, to choose what's in the frame."}
        style={{ aspectRatio: `1 / ${ratio}`, touchAction: fits ? "auto" : "none" }}
        className={`relative w-full overflow-hidden rounded-card bg-black ${fits ? "" : "cursor-grab active:cursor-grabbing"}`}>
        <img src={photo.url} alt={photo.alt.trim() || `Photo ${index + 1} of ${count}`} draggable={false}
          onLoad={(e) => { if (!photo.w) onSize(photo.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight); }}
          style={{ objectPosition: `${photo.x}% ${photo.y}%`, filter: look.css || undefined }}
          className="pointer-events-none h-full w-full select-none object-cover" />
        {look.vignette > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: vignetteCss(look.vignette) }} />}
        {!fits && (
          <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-label font-semibold text-white">
            <Move size={13} /> Drag to frame it
          </span>
        )}
        {count > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-label font-semibold text-white tabular">
            {index === 0 ? "Cover · " : ""}{index + 1}/{count}
          </span>
        )}
      </div>
      {onPrev && <IconButton icon={ChevronLeft} label="Previous photo" tone="overlay" className="absolute left-2 top-1/2 -translate-y-1/2" onClick={onPrev} />}
      {onNext && <IconButton icon={ChevronRight} label="Next photo" tone="overlay" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={onNext} />}
    </div>
  );
}

// The filters, each shown on this photo.
function Filters({ photo, onPick, onApplyAll }) {
  return (
    <div>
      <ul className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Filters">
        {STORY_FILTERS.map((f) => {
          const on = (photo.filter || "none") === f.id;
          return (
            <li key={f.id} className="shrink-0">
              <button type="button" onClick={() => onPick(f.id)} aria-pressed={on}
                className="press flex w-16 flex-col items-center gap-1">
                <span className={`relative block h-16 w-16 overflow-hidden rounded-control ring-2 ring-offset-2 ring-offset-canvas ${on ? "ring-accent" : "ring-transparent"}`}>
                  <img src={photo.url} alt="" style={{ filter: f.css || undefined }} className="h-full w-full object-cover" />
                  {f.vignette > 0 && <span aria-hidden="true" className="absolute inset-0" style={{ background: vignetteCss(f.vignette) }} />}
                </span>
                <span className={`w-full truncate text-center text-label ${on ? "font-semibold text-fg" : "text-fg-subtle"}`}>{f.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {onApplyAll && (
        <button type="button" onClick={onApplyAll} className="mt-1 text-caption font-semibold text-accent-text hover:underline">
          Use {filterById(photo.filter).name === "Original" ? "no filter" : filterById(photo.filter).name} on every photo
        </button>
      )}
    </div>
  );
}

// The ordered strip. Index 0 is the cover. Hold a thumbnail (or, with a
// mouse, just drag it) to move it; the arrow buttons do the same by keyboard.
function Strip({ photos, active, onActive, busy, onRemove, onMove, onReorder, onAdd, onCamera, onRoll }) {
  const addRef = useRef(null);
  const listRef = useRef(null);
  const drag = useRef(null); // { id, x, y, on, timer, el, pointerId }
  const dragged = useRef(false);
  const [moving, setMoving] = useState(null);

  // While a photo is being dragged, the strip mustn't scroll under the finger.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const hold = (e) => { if (drag.current?.on) e.preventDefault(); };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);
  const pickUp = (d) => {
    d.on = true;
    setMoving(d.id);
    try { d.el.setPointerCapture(d.pointerId); } catch { /* still works without */ }
    navigator.vibrate?.(8);
  };
  const slotAt = (x) => {
    const items = [...listRef.current.querySelectorAll("[data-photo]")];
    const i = items.findIndex((it) => { const r = it.getBoundingClientRect(); return x < r.left + r.width / 2; });
    return i < 0 ? items.length - 1 : i;
  };
  const down = (e, id) => {
    if (busy || e.button > 0) return;
    const d = { id, x: e.clientX, y: e.clientY, on: false, el: e.currentTarget, pointerId: e.pointerId };
    if (e.pointerType !== "mouse") d.timer = setTimeout(() => pickUp(d), HOLD_MS);
    drag.current = d;
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      if (e.pointerType === "mouse") pickUp(d);
      else { clearTimeout(d.timer); drag.current = null; return; } // moving first means scrolling the strip
    }
    onReorder(d.id, slotAt(e.clientX));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.on) { setMoving(null); dragged.current = true; setTimeout(() => { dragged.current = false; }, 0); }
  };
  const tile = "press flex h-16 w-16 items-center justify-center rounded-control border-2 border-dashed border-field text-fg-muted hover:text-fg";

  return (
    <div>
      <ul ref={listRef} className="flex gap-2 overflow-x-auto px-1 pb-1 pt-2 no-scrollbar" aria-label="Photos in this post, in order">
        {photos.map((ph, i) => (
          <li key={ph.id} data-photo className={`relative shrink-0 transition-transform duration-standard ${moving === ph.id ? "z-10 scale-110" : ""}`}>
            <button type="button" aria-label={`Photo ${i + 1}${i === 0 ? ", the cover" : ""}`} aria-current={i === active || undefined}
              onPointerDown={(e) => down(e, ph.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              onClick={() => { if (!dragged.current) onActive(i); }} onContextMenu={(e) => e.preventDefault()}
              style={{ WebkitTouchCallout: "none" }}
              className={`press block h-16 w-16 select-none overflow-hidden rounded-control ring-2 ring-offset-2 ring-offset-canvas ${
                moving === ph.id ? "shadow-raised ring-accent" : i === active ? "ring-accent" : "ring-transparent"
              }`}>
              <img src={ph.url} alt="" draggable={false} style={{ filter: filterById(ph.filter).css || undefined, objectPosition: `${ph.x}% ${ph.y}%` }}
                className="pointer-events-none h-full w-full object-cover" />
              <span aria-hidden="true" className="absolute bottom-1 left-1 rounded-full bg-black/65 px-1.5 text-[11px] font-bold leading-4 text-white tabular">
                {i === 0 ? "Cover" : i + 1}
              </span>
            </button>
            {!busy && (
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove photo ${i + 1}`}
                className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-canvas">
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {photos.length < MAX_SLIDES && !busy && (
          <li className="shrink-0">
            <button type="button" onClick={() => addRef.current?.click()} aria-label="Add photos from your library" className={tile}>
              <Plus size={20} aria-hidden="true" />
            </button>
            <input ref={addRef} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
          </li>
        )}
        {photos.length < MAX_SLIDES && !busy && onCamera && (
          <li className="shrink-0">
            <button type="button" onClick={onCamera} aria-label="Take another photo" className={tile}><CameraIcon size={20} aria-hidden="true" /></button>
          </li>
        )}
        {photos.length < MAX_SLIDES && !busy && onRoll && (
          <li className="shrink-0">
            <button type="button" onClick={onRoll} aria-label="Add photos from a roll" className={tile}><Aperture size={20} aria-hidden="true" /></button>
          </li>
        )}
      </ul>
      {photos.length > 1 && !busy && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-caption text-fg-subtle">
          <span className="mr-1">Hold and drag a photo to reorder it, or move photo {active + 1}:</span>
          <IconButton icon={ChevronLeft} label="Move this photo earlier" size={16} disabled={active === 0} onClick={() => onMove(active, -1)} />
          <IconButton icon={ChevronRight} label="Move this photo later" size={16} disabled={active === photos.length - 1} onClick={() => onMove(active, 1)} />
        </div>
      )}
    </div>
  );
}
