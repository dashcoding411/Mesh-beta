import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { Input } from "./ui/Field";
import { Spinner } from "./ui/States";

const MAX = 60;

// Photon (komoot) searches OpenStreetMap as you type, with no key or cookies.
// Only the typed words leave the device, and only while this box is in use.
const PHOTON = "https://photon.komoot.io/api/";

// "Bondi Beach, Sydney, New South Wales, Australia", dropping the state, then
// the town, when that's too long to store.
function placeLabel(p) {
  const town = p.city || p.county || p.district;
  const tries = [[p.name, town, p.state, p.country], [p.name, town, p.country], [p.name, p.country], [p.name]];
  for (const parts of tries) {
    const label = [...new Set(parts.filter(Boolean))].join(", ");
    if (label.length <= MAX) return label;
  }
  return (p.name || "").slice(0, MAX);
}

async function searchPlaces(q, signal) {
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=8&lang=en`, { signal });
  if (!res.ok) throw new Error("search failed");
  const { features = [] } = await res.json();
  const seen = new Set();
  return features
    .map((f) => ({ label: placeLabel(f.properties || {}), kind: f.properties?.osm_value || "" }))
    .filter((r) => r.label && !seen.has(r.label) && seen.add(r.label))
    .slice(0, 6);
}

/**
 * The composer's location: type to search real places and pick one, or keep
 * what you typed. A combobox: arrows move, Enter picks, Escape closes.
 */
export default function LocationField({ id, value, onChange, ...rest }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [query, setQuery] = useState("");
  const listId = useId();
  const picked = useRef(value);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === picked.current) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const list = await searchPlaces(q, ctrl.signal);
        setResults(list);
        setActive(list.length ? 0 : -1);
        setOpen(true);
        setStatus("idle");
      } catch (err) {
        if (err.name !== "AbortError") { setStatus("error"); setResults([]); }
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const pick = (label) => {
    picked.current = label;
    onChange(label);
    setOpen(false);
    setResults([]);
  };

  const onKey = (e) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active].label);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const showList = open && value.trim().length >= 2;

  return (
    <div className="relative">
      <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <Input {...rest} id={id} value={value} maxLength={MAX} autoComplete="off" placeholder="Search for a place"
        role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); picked.current = ""; }}
        onKeyDown={onKey} onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="!pl-9 !pr-9" />
      {status === "loading" && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}
      <span className="sr-only" aria-live="polite">
        {showList ? (results.length ? `${results.length} places found` : "No places found") : status === "error" ? "Place search isn't working right now" : ""}
      </span>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Places"
          className="absolute inset-x-0 top-full z-sheet mt-1.5 max-h-72 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-overlay anim-rise">
          {results.map((r, i) => (
            <li key={r.label} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.label)} onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-callout ${i === active ? "bg-surface-2" : ""}`}>
              <MapPin size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
            </li>
          ))}
          {!results.length && (
            <li role="option" aria-selected="false" aria-disabled="true" className="flex min-h-11 items-center gap-2.5 px-2.5 text-caption text-fg-subtle">
              <Search size={14} aria-hidden="true" /> No places match. What you typed will be used as it is.
            </li>
          )}
        </ul>
      )}
      <p className="mt-1.5 text-label text-fg-subtle">Places from OpenStreetMap, via Photon.</p>
    </div>
  );
}
