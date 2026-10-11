import { useEffect, useState } from "react";
import { Aperture, ArrowLeft, Check, ChevronRight } from "lucide-react";
import { fetchMyRolls, fetchRollPhotos, isDeveloped, me, pickedRollFiles, tsMillis, MAX_SLIDES } from "../../lib/db";
import Dialog from "../ui/Dialog";
import Button from "../ui/Button";
import MediaImg from "../ui/MediaImg";
import { EmptyState, Skeleton } from "../ui/States";

/**
 * Roll photos to pick for a post: tap to add, tap again to take out. Each
 * shows its number in the order picked, which is the post's order (it can
 * still be changed in the composer). Up to `max`.
 */
export function PickablePhotos({ photos, picked, onChange, max = MAX_SLIDES }) {
  const toggle = (id) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < max ? [...picked, id] : picked);
  return (
    <ul className="grid grid-cols-3 gap-1" aria-label="Photos to pick">
      {photos.map((p) => {
        const n = picked.indexOf(p.id);
        const on = n >= 0;
        const full = !on && picked.length >= max;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => toggle(p.id)} disabled={full} aria-pressed={on}
              aria-label={on ? `Photo ${n + 1} in your post. Tap to take it out` : full ? `You've picked ${max}, the most a post can have` : "Add to your post"}
              className="press relative block aspect-[3/4] w-full overflow-hidden rounded-[4px] bg-surface-2 disabled:opacity-40">
              <MediaImg src={p.url} alt="" loading="lazy" placeholderClass="h-full w-full"
                className={`h-full w-full object-cover transition-transform duration-standard ${on ? "scale-[0.9] rounded-[4px]" : ""}`} />
              <span aria-hidden="true"
                className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold tabular shadow ${on ? "bg-accent text-white" : "bg-black/25"}`}>
                {on ? n + 1 : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Shown while photos someone else took are picked. */
export function OthersNote({ photos, picked }) {
  const others = picked.some((id) => photos.find((p) => p.id === id)?.authorId !== me());
  if (!others) return null;
  return <p className="text-caption text-fg-subtle">Posting a photo someone else took? Check they're happy for it to be shared.</p>;
}

/**
 * From the composer: pick one of your developed rolls, then its photos.
 * `room` is how many more the post can take. Calls `onPick(files)`.
 */
export function RollPhotoPicker({ room = MAX_SLIDES, onClose, onPick }) {
  const [rolls, setRolls] = useState(null);
  const [roll, setRoll] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchMyRolls()
      .then((list) => { if (live) setRolls(list.filter((r) => isDeveloped(r) && (r.photoCount || 0) > 0)); })
      .catch(() => { if (live) setRolls([]); });
    return () => { live = false; };
  }, []);

  const openRoll = (r) => {
    setRoll(r);
    setPhotos(null);
    setPicked([]);
    fetchRollPhotos(r.id).then(setPhotos).catch(() => setPhotos([]));
  };
  const add = async () => {
    setBusy(true);
    setError("");
    try { onPick(await pickedRollFiles(photos, picked)); }
    catch { setError("Couldn't get those photos. Check your connection and try again."); setBusy(false); }
  };

  return (
    <Dialog title={roll ? roll.title : "Photos from a roll"} onClose={onClose} size="lg"
      footer={roll && photos?.length ? (
        <div className="space-y-2">
          <OthersNote photos={photos} picked={picked} />
          {error && <p className="text-caption text-danger-text" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setRoll(null)}>Rolls</Button>
            <span className="flex-1 text-caption text-fg-subtle tabular">{picked.length} of up to {room}</span>
            <Button variant="primary" icon={Check} disabled={!picked.length} loading={busy} onClick={add}>
              Add {picked.length || ""} {picked.length === 1 ? "photo" : "photos"}
            </Button>
          </div>
        </div>
      ) : null}>
      {!roll && rolls === null && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 !rounded-card" />)}</div>}
      {!roll && rolls?.length === 0 && (
        <EmptyState compact icon={Aperture} title="No developed rolls yet" body="Once one of your rolls develops, its photos can go straight into a post from here." />
      )}
      {!roll && rolls?.length > 0 && (
        <ul className="space-y-2">
          {rolls.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openRoll(r)}
                className="press flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-[#111114] text-[#ff9b2f]"><Aperture size={22} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold">{r.title}</span>
                  <span className="block text-caption text-fg-subtle">
                    {r.photoCount} {r.photoCount === 1 ? "photo" : "photos"} · developed {new Date(tsMillis(r.developAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </span>
                <ChevronRight size={18} className="text-fg-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {roll && photos === null && <div className="grid grid-cols-3 gap-1">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] !rounded-[4px]" />)}</div>}
      {roll && photos?.length === 0 && <EmptyState compact icon={Aperture} title="No photos in this roll" />}
      {roll && photos?.length > 0 && (
        <>
          <p className="mb-3 text-caption text-fg-subtle">Tap photos in the order you want them. You can change the order before posting.</p>
          <PickablePhotos photos={photos} picked={picked} onChange={setPicked} max={room} />
        </>
      )}
    </Dialog>
  );
}
