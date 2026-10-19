import { lazy, Suspense, useEffect, useState } from "react";
import { Check, Plus, Star, Trash2, History } from "lucide-react";
import {
  fetchHighlights, fetchHighlightStories, fetchMyStoryArchive, createHighlight, updateHighlight, deleteHighlight,
  addToHighlight, tsMillis, HIGHLIGHT_TITLE_MAX, MAX_HIGHLIGHT_STORIES,
} from "../lib/db";
import { checkName } from "../lib/moderation";
import { navigate } from "../lib/router";
import { plural } from "../lib/format";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import Button from "./ui/Button";
import MediaImg from "./ui/MediaImg";
import { Field, Input } from "./ui/Field";
import { EmptyState, InlineMessage, Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";
const StoryViewer = lazy(() => import("./StoryViewer"));

/** A story's picture: the image, or the first frame of a video. */
export function StoryFrame({ url, type, className = "" }) {
  if (!url) return <span className={`block bg-surface-3 ${className}`} aria-hidden="true" />;
  return type?.startsWith("video/")
    ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" className={`object-cover ${className}`} />
    : <MediaImg src={url} alt="" className={`object-cover ${className}`} placeholderClass={className} />;
}

/** The row of highlight circles on a profile. Hidden on others' profiles when empty. */
export default function Highlights({ profile, own = false }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [playing, setPlaying] = useState(null); // { highlight, items }
  const [editing, setEditing] = useState(null); // highlight, or {} for a new one

  useEffect(() => {
    let live = true;
    fetchHighlights(profile.id).then((l) => { if (live) setList(l); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [profile.id]);

  if (!own && !list?.length) return null;

  const play = async (h) => {
    const items = await fetchHighlightStories(h, profile.id).catch(() => []);
    if (!items.length) return toast({ title: "Nothing to show here", body: own ? "Its stories were deleted. Edit it to add more." : "These stories aren't available." });
    setPlaying({ highlight: h, items });
  };

  const saved = (h) => setList((l) => {
    const rest = (l || []).filter((x) => x.id !== h.id);
    return [...rest, h].sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  });

  return (
    <section aria-label="Story highlights" className="px-4 pb-3 md:px-6">
      <ul className="flex gap-4 overflow-x-auto no-scrollbar py-1">
        {own && (
          <li className="shrink-0">
            <button type="button" onClick={() => setEditing({})} className="press flex w-[72px] flex-col items-center gap-1.5">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-fg-muted">
                <Plus size={24} aria-hidden="true" />
              </span>
              <span className="text-label font-semibold text-fg-muted">New</span>
            </button>
          </li>
        )}
        {list === null && own && [0, 1].map((i) => <li key={i}><Skeleton className="h-16 w-16 !rounded-full" /></li>)}
        {list?.map((h) => (
          <li key={h.id} className="shrink-0">
            <button type="button" onClick={() => play(h)} aria-label={`Highlight: ${h.title}, ${plural(h.storyIds.length, "story", "stories")}`}
              className="press flex w-[72px] flex-col items-center gap-1.5">
              <span className="h-16 w-16 overflow-hidden rounded-full border border-line-strong p-0.5">
                <StoryFrame url={h.coverUrl} type={h.coverType} className="h-full w-full rounded-full" />
              </span>
              <span className="w-full truncate text-center text-label font-semibold text-fg">{h.title}</span>
            </button>
          </li>
        ))}
      </ul>

      {playing && (
        <Suspense fallback={null}>
          <StoryViewer key={playing.highlight.id}
            thread={{ authorId: profile.id, authorName: profile.username, authorPhoto: profile.photoURL, items: playing.items }}
            highlight={playing.highlight}
            onEditHighlight={own ? () => { const h = playing.highlight; setPlaying(null); setEditing(h); } : undefined}
            onClose={() => setPlaying(null)} onNextThread={() => setPlaying(null)}
            onDeleted={(id) => setPlaying((p) => (p ? { ...p, items: p.items.filter((s) => s.id !== id) } : p))} />
        </Suspense>
      )}
      {editing && (
        <HighlightEditor highlight={editing.id ? editing : null} onClose={() => setEditing(null)}
          onSaved={(h) => { saved(h); setEditing(null); }}
          onDeleted={(id) => { setList((l) => l.filter((x) => x.id !== id)); setEditing(null); }} />
      )}
    </section>
  );
}

/** Make or edit a highlight: name it and pick stories from your archive. */
export function HighlightEditor({ highlight, preselect = [], onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const [title, setTitle] = useState(highlight?.title || "");
  const [archive, setArchive] = useState(null);
  const [picked, setPicked] = useState(() => new Set([...(highlight?.storyIds || []), ...preselect]));
  const [coverUrl, setCoverUrl] = useState(highlight?.coverUrl || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    fetchMyStoryArchive().then((a) => { if (live) setArchive(a); }).catch(() => { if (live) setArchive([]); });
    return () => { live = false; };
  }, []);

  const toggle = (s) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(s.id)) next.delete(s.id);
    else if (next.size < MAX_HIGHLIGHT_STORIES) next.add(s.id);
    return next;
  });

  // Oldest first, the order they were posted in.
  const chosen = (archive || []).filter((s) => picked.has(s.id)).reverse();

  const save = async () => {
    const t = title.trim();
    if (!t) return setError("Give it a name.");
    const { error: nameError } = checkName(t);
    if (nameError) return setError(nameError);
    if (!chosen.length) return setError("Pick at least one story.");
    setBusy(true);
    setError("");
    try {
      const cover = chosen.find((s) => s.mediaUrl === coverUrl) || chosen[0];
      let id = highlight?.id;
      if (id) await updateHighlight(highlight, { title: t, stories: chosen, coverStory: cover });
      else id = await createHighlight(t, chosen, cover);
      toast({ title: highlight ? "Highlight saved" : `"${t}" is on your profile` });
      onSaved({
        ...(highlight || {}), id, title: t, storyIds: chosen.map((s) => s.id), coverUrl: cover.mediaUrl, coverType: cover.mediaType,
        createdAt: highlight?.createdAt || { toMillis: () => Date.now() }, // shaped like a Timestamp for sorting
      });
    } catch (err) {
      setError(err?.code === "permission-denied" ? "That name isn't allowed. Try another." : "Couldn't save the highlight. Try again.");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await deleteHighlight(highlight); toast({ title: "Highlight deleted", body: "The stories are still in your archive." }); onDeleted(highlight.id); }
    catch { toast({ tone: "error", title: "Couldn't delete the highlight" }); setBusy(false); }
  };

  return (
    <Dialog title={highlight ? "Edit highlight" : "New highlight"} onClose={onClose} size="lg"
      footer={(
        <div className="flex items-center gap-2">
          {highlight && <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</Button>}
          <span className="flex-1 text-caption text-fg-subtle">{plural(chosen.length, "story", "stories")}</span>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Save</Button>
        </div>
      )}>
      <Field label="Name" count={title.length} max={HIGHLIGHT_TITLE_MAX}>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} maxLength={HIGHLIGHT_TITLE_MAX} placeholder="Summer, Friends, Food…" />
      </Field>
      <InlineMessage>{error}</InlineMessage>

      <h3 className="mb-1 mt-4 text-callout font-semibold">Stories</h3>
      <p className="mb-3 text-caption text-fg-subtle">Tap to add or remove. The star picks the cover.</p>
      {archive === null && <div className="grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[9/16] !rounded-control" />)}</div>}
      {archive?.length === 0 && (
        <EmptyState compact icon={History} title="No stories yet" body="Your stories stay here after 24 hours." />
      )}
      {archive?.length > 0 && (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {archive.map((s) => {
            const on = picked.has(s.id);
            const isCover = on && (coverUrl ? s.mediaUrl === coverUrl : chosen[0]?.id === s.id);
            return (
              <li key={s.id} className="relative">
                <button type="button" onClick={() => toggle(s)} aria-pressed={on}
                  aria-label={`Story from ${new Date(tsMillis(s.createdAt)).toLocaleDateString()}`}
                  className={`press relative block aspect-[9/16] w-full overflow-hidden rounded-control ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}>
                  <StoryFrame url={s.mediaUrl} type={s.mediaType} className="h-full w-full" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-label font-semibold text-white">
                    {new Date(tsMillis(s.createdAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  {on && <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white"><Check size={14} aria-hidden="true" /></span>}
                </button>
                {on && (
                  <button type="button" onClick={() => setCoverUrl(s.mediaUrl)} aria-pressed={isCover} aria-label={isCover ? "This is the cover" : "Use as cover"}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                    <Star size={15} aria-hidden="true" className={isCover ? "fill-amber-300 text-amber-300" : ""} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmDelete && (
        <ConfirmDialog title="Delete this highlight?" body="It comes off your profile. The stories stay in your archive." confirmLabel="Delete"
          busy={busy} onConfirm={remove} onClose={() => setConfirmDelete(false)} />
      )}
    </Dialog>
  );
}

/** From a story you posted: put it in a highlight, or start a new one. */
export function AddToHighlight({ story, ownerId, onClose }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    fetchHighlights(ownerId).then((l) => { if (live) setList(l); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [ownerId]);

  const add = async (h) => {
    try {
      await addToHighlight(h, story);
      toast({ title: `Added to "${h.title}"` });
      onClose();
    } catch (err) { toast({ tone: "error", title: "Couldn't add it", body: err?.message?.startsWith("A highlight") ? err.message : undefined }); }
  };

  if (creating) {
    return <HighlightEditor preselect={[story.id]} onClose={onClose} onSaved={onClose} onDeleted={onClose} />;
  }
  return (
    <Dialog title="Add to highlight" onClose={onClose} size="sm">
      <ul className="space-y-1">
        <li>
          <button type="button" onClick={() => setCreating(true)} className="press flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-line-strong"><Plus size={18} aria-hidden="true" /></span>
            <span className="text-callout font-semibold">New highlight</span>
          </button>
        </li>
        {list === null && <li><Skeleton className="h-14 !rounded-control" /></li>}
        {list?.map((h) => {
          const has = h.storyIds.includes(story.id);
          return (
            <li key={h.id}>
              <button type="button" onClick={() => add(h)} disabled={has}
                className="press flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2 disabled:opacity-60">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full"><StoryFrame url={h.coverUrl} type={h.coverType} className="h-full w-full" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold">{h.title}</span>
                  <span className="block text-caption text-fg-subtle">{has ? "Already in it" : plural(h.storyIds.length, "story", "stories")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => { onClose(); navigate("/account/archive"); }}
        className="mt-3 text-caption font-semibold text-accent-text hover:underline">Open your story archive</button>
    </Dialog>
  );
}
