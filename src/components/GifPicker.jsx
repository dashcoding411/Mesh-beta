import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { searchGifs } from "../lib/gifs";
import { isMinor } from "../lib/db";
import { useShell } from "./shell/ShellContext";
import Dialog from "./ui/Dialog";
import { Input } from "./ui/Field";
import { Skeleton, EmptyState } from "./ui/States";

/* Trending on open, search as you type, tap to pick. Every result is a
   button with the GIF's title as its label. */
export default function GifPicker({ onPick, onClose }) {
  const { profile } = useShell();
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      searchGifs(q, { minor: isMinor(profile) })
        .then((list) => { if (alive) { setGifs(list); setError(""); } })
        .catch((e) => { if (alive) { setGifs([]); setError(e.message); } });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, profile]);

  return (
    <Dialog title="Choose a GIF" onClose={onClose} size="lg" initialFocusRef={inputRef}
      footer={<p className="text-center text-label font-semibold uppercase tracking-wider text-fg-subtle">Powered by GIPHY</p>}>
      <div className="relative mb-3">
        <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <label htmlFor="gif-search" className="sr-only">Search GIFs</label>
        <Input id="gif-search" ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs" className="!pl-10" />
      </div>
      {gifs === null && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 !rounded-control" />)}</div>}
      {gifs?.length === 0 && <EmptyState compact title={error || `No GIFs for “${q}”`} body={error ? "Try again in a moment." : "Try another word."} />}
      {gifs?.length > 0 && (
        <ul className="columns-2 gap-2 sm:columns-3">
          {gifs.map((g) => (
            <li key={g.id} className="mb-2 break-inside-avoid">
              <button type="button" onClick={() => onPick(g)} aria-label={g.title || "GIF"}
                className="press block w-full overflow-hidden rounded-control bg-surface-2">
                <img src={g.url} alt="" loading="lazy" width={g.width} height={g.height} className="h-auto w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A GIF inside a post, comment or message. */
export function GifView({ gif, className = "" }) {
  if (!gif?.url) return null;
  const ratio = gif.width && gif.height ? `${gif.width} / ${gif.height}` : "4 / 3";
  return (
    <span className={`relative block overflow-hidden rounded-card bg-surface-2 ${className}`} style={{ aspectRatio: ratio, maxWidth: 360 }}>
      <img src={gif.url} alt={gif.title ? `GIF: ${gif.title}` : "GIF"} loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 text-label font-bold text-white" aria-hidden="true">GIF</span>
    </span>
  );
}
