import { useEffect, useState } from "react";
import { ArrowLeft, Bookmark, Check, FolderPlus, Lock, Pencil, Plus, Trash2, Type, Images } from "lucide-react";
import {
  fetchAlbums, fetchAlbumPosts, createAlbum, renameAlbum, setAlbumPosts, addToAlbum, removeFromAlbum, deleteAlbum,
  coverOf, ALBUM_NAME_MAX,
} from "../lib/db";
import { checkName } from "../lib/moderation";
import { plural } from "../lib/format";
import Button from "./ui/Button";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import MediaImg from "./ui/MediaImg";
import { Field, Input } from "./ui/Field";
import { InlineMessage, Skeleton, EmptyState } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { PostGrid } from "./ProfileParts";
import { TileVisual } from "./Search";

function AlbumCover({ album, className = "" }) {
  if (album.coverType === "video") {
    return <video src={`${album.coverUrl}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" className={`object-cover ${className}`} />;
  }
  if (album.coverUrl) return <MediaImg src={album.coverUrl} alt="" className={`object-cover ${className}`} placeholderClass={className} />;
  return (
    <span className={`flex items-center justify-center bg-surface-2 text-fg-subtle ${className}`} aria-hidden="true">
      {album.postIds?.length ? <Type size={28} /> : <Images size={28} />}
    </span>
  );
}

const nameProblem = (name) => (!name.trim() ? "Give it a name." : checkName(name.trim()).error || "");

/** The Saved tab on your profile: albums first, then everything you've saved. */
export default function SavedSection({ saved }) {
  const toast = useToast();
  const [albums, setAlbums] = useState(null);
  const [open, setOpen] = useState(null); // album being viewed
  const [openPosts, setOpenPosts] = useState(null);
  const [picking, setPicking] = useState(null); // { album? } for the post picker
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let live = true;
    fetchAlbums().then((l) => { if (live) setAlbums(l); }).catch(() => { if (live) setAlbums([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    fetchAlbumPosts(open).then((p) => { if (live) setOpenPosts(p); }).catch(() => { if (live) setOpenPosts([]); });
    return () => { live = false; };
  }, [open]);

  // Posts unsaved elsewhere drop out of the albums here too.
  const savedIds = saved ? new Set(saved.map((p) => p.id)) : null;
  const shown = (albums || []).map((a) => (savedIds ? { ...a, postIds: a.postIds.filter((id) => savedIds.has(id)) } : a));

  const replace = (a) => setAlbums((l) => [a, ...(l || []).filter((x) => x.id !== a.id)]);
  const view = (a) => { setOpenPosts(null); setOpen(a); };

  if (open) {
    const album = shown.find((a) => a.id === open.id) || open;
    const posts = openPosts && savedIds ? openPosts.filter((p) => savedIds.has(p.id)) : openPosts;
    return (
      <section aria-label={album.name}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setOpen(null)}>All saved</Button>
          <h2 className="min-w-0 flex-1 truncate text-title-3">{album.name}</h2>
          <Button size="sm" icon={Plus} onClick={() => setPicking({ album })}>Add or remove</Button>
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRenaming(album)} aria-label={`Rename ${album.name}`} />
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(album)} aria-label={`Delete ${album.name}`} />
        </div>
        <PostGrid posts={posts} emptyIcon={Images} emptyTitle="Nothing in this album yet"
          emptyBody="Add posts from your saved list."
          emptyAction={<Button variant="primary" icon={Plus} onClick={() => setPicking({ album })}>Add posts</Button>} />
        {picking && <AlbumPicker album={picking.album} saved={saved || []} onClose={() => setPicking(null)}
          onSaved={(a) => { replace(a); setOpen(a); setPicking(null); }} />}
        {renaming && <RenameDialog album={renaming} onClose={() => setRenaming(null)}
          onSaved={(a) => { replace(a); setOpen(a); setRenaming(null); }} />}
        {deleting && (
          <ConfirmDialog title={`Delete "${deleting.name}"?`} body="The posts stay in your saved list." confirmLabel="Delete album"
            onClose={() => setDeleting(null)}
            onConfirm={async () => {
              try {
                await deleteAlbum(deleting);
                setAlbums((l) => l.filter((x) => x.id !== deleting.id));
                setDeleting(null); setOpen(null);
                toast({ title: "Album deleted" });
              } catch { toast({ tone: "error", title: "Couldn't delete the album" }); }
            }} />
        )}
      </section>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 md:px-6">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-caption text-fg-subtle">
          <Lock size={14} aria-hidden="true" /> Only you can see this tab.
        </p>
        <Button size="sm" icon={FolderPlus} onClick={() => setPicking({})}>New album</Button>
      </div>

      {albums === null && <div className="flex gap-3 px-4 pb-3 md:px-6">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-28 !rounded-card" />)}</div>}
      {shown.length > 0 && (
        <section aria-label="Albums" className="pb-3">
          <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6">
            {shown.map((a) => (
              <li key={a.id} className="w-28 shrink-0">
                <button type="button" onClick={() => view(a)} className="press block w-full text-left"
                  aria-label={`${a.name}, ${plural(a.postIds.length, "post")}`}>
                  <AlbumCover album={a} className="aspect-square w-full rounded-card" />
                  <span className="mt-1.5 block truncate text-callout font-semibold">{a.name}</span>
                  <span className="block text-caption text-fg-subtle">{plural(a.postIds.length, "post")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length > 0 && <h2 className="px-4 pb-2 text-callout font-semibold text-fg-muted md:px-6">All saved</h2>}
      <PostGrid posts={saved} emptyIcon={Bookmark} emptyTitle="Nothing saved yet"
        emptyBody="Tap the bookmark on any post to keep it here, then file it into albums." />

      {picking && <AlbumPicker saved={saved || []} onClose={() => setPicking(null)}
        onSaved={(a) => { replace(a); setPicking(null); toast({ title: `"${a.name}" created` }); }} />}
    </>
  );
}

/** New album (name + posts), or change which saved posts are in one. */
function AlbumPicker({ album, saved, onClose, onSaved }) {
  const [name, setName] = useState(album?.name || "");
  const [picked, setPicked] = useState(() => new Set(album?.postIds || []));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    const problem = album ? "" : nameProblem(name);
    if (problem) return setError(problem);
    // Keep the album's order; new picks go on the end (oldest saved first).
    const keep = (album?.postIds || []).filter((id) => picked.has(id));
    const added = [...saved].reverse().map((p) => p.id).filter((id) => picked.has(id) && !keep.includes(id));
    const ids = [...keep, ...added];
    const byId = new Map(saved.map((p) => [p.id, p]));
    const posts = ids.map((id) => byId.get(id) || { id });
    setBusy(true);
    setError("");
    try {
      if (album) {
        await setAlbumPosts(album, posts);
        onSaved({ ...album, postIds: ids });
      } else {
        const id = await createAlbum(name, posts);
        onSaved({ id, name: name.trim(), postIds: ids, coverUrl: "", coverType: "", createdAt: null, updatedAt: null, ...pickCover(posts) });
      }
    } catch (err) {
      setError(err?.code === "permission-denied" ? "That name isn't allowed. Try another." : "Couldn't save the album. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog title={album ? `Edit "${album.name}"` : "New album"} onClose={onClose} size="lg"
      footer={(
        <div className="flex items-center gap-2">
          <span className="flex-1 text-caption text-fg-subtle">{plural(picked.size, "post")} picked</span>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{album ? "Save" : "Create album"}</Button>
        </div>
      )}>
      {!album && (
        <Field label="Name" count={name.length} max={ALBUM_NAME_MAX}>
          <Input value={name} maxLength={ALBUM_NAME_MAX} placeholder="Recipes, Outfits, Trips…" autoFocus
            onChange={(e) => { setName(e.target.value); setError(""); }} />
        </Field>
      )}
      <InlineMessage>{error}</InlineMessage>
      <p className="mb-2 mt-3 text-caption text-fg-subtle">Tap saved posts to {album ? "add or remove them" : "put them in it"}. You can also add posts later.</p>
      {saved.length === 0 ? (
        <EmptyState compact icon={Bookmark} title="Nothing saved yet" body="Save posts with the bookmark, then file them here." />
      ) : (
        <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-4">
          {saved.map((p) => {
            const on = picked.has(p.id);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                  aria-label={`${p.kind === "text" ? "Strand" : p.kind === "post" ? "Still" : "Flick"} by @${p.authorName}`}
                  className={`press relative block aspect-square w-full overflow-hidden bg-surface-2 ${on ? "ring-2 ring-inset ring-accent" : ""}`}>
                  <TileVisual post={p} />
                  {on && <span className="absolute inset-0 bg-accent/20" aria-hidden="true" />}
                  <span className={`absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent text-white" : "border-white bg-black/30"}`} aria-hidden="true">
                    {on && <Check size={14} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

// Matches the cover createAlbum stores: the newest post with a picture.
const pickCover = (posts) => coverOf([...posts].reverse().find((p) => coverOf(p).coverUrl));

function RenameDialog({ album, onClose, onSaved }) {
  const [name, setName] = useState(album.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    setBusy(true);
    try { await renameAlbum(album, name); onSaved({ ...album, name: name.trim() }); }
    catch { setError("Couldn't rename it. Try again."); setBusy(false); }
  };
  return (
    <Dialog title="Rename album" onClose={onClose} variant="center" size="sm"
      footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div>}>
      <Field label="Name" count={name.length} max={ALBUM_NAME_MAX}>
        <Input value={name} maxLength={ALBUM_NAME_MAX} autoFocus onChange={(e) => { setName(e.target.value); setError(""); }} />
      </Field>
      <InlineMessage>{error}</InlineMessage>
    </Dialog>
  );
}

/** After saving a post: file it into albums, or start a new one with it. */
export function AddToAlbum({ post, onClose }) {
  const toast = useToast();
  const [albums, setAlbums] = useState(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetchAlbums().then((l) => { if (live) setAlbums(l); }).catch(() => { if (live) setAlbums([]); });
    return () => { live = false; };
  }, []);

  const toggle = async (a) => {
    const inIt = a.postIds.includes(post.id);
    try {
      if (inIt) await removeFromAlbum(a, post.id); else await addToAlbum(a, post);
      setAlbums((l) => l.map((x) => (x.id === a.id ? { ...x, postIds: inIt ? x.postIds.filter((id) => id !== post.id) : [...x.postIds, post.id] } : x)));
    } catch (err) { toast({ tone: "error", title: "Couldn't update the album", body: err?.message?.startsWith("An album") ? err.message : undefined }); }
  };

  const create = async (e) => {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await createAlbum(name, [post]);
      toast({ title: `Saved to "${name.trim()}"` });
      onClose();
    } catch { setError("Couldn't create the album. Try again."); setBusy(false); }
  };

  return (
    <Dialog title="Save to album" onClose={onClose} size="sm"
      footer={<div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>}>
      {creating ? (
        <form onSubmit={create} className="mb-3 space-y-2">
          <Field label="Album name" count={name.length} max={ALBUM_NAME_MAX}>
            <Input value={name} maxLength={ALBUM_NAME_MAX} autoFocus placeholder="Recipes, Outfits, Trips…" onChange={(e) => { setName(e.target.value); setError(""); }} />
          </Field>
          <InlineMessage>{error}</InlineMessage>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setCreating(false)}>Back</Button>
            <Button size="sm" type="submit" variant="primary" loading={busy}>Create and save</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="press mb-1 flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-control border-2 border-dashed border-line-strong"><Plus size={18} aria-hidden="true" /></span>
          <span className="text-callout font-semibold">New album</span>
        </button>
      )}
      {albums === null && <Skeleton className="h-14 !rounded-control" />}
      <ul className="space-y-1">
        {albums?.map((a) => {
          const inIt = a.postIds.includes(post.id);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => toggle(a)} aria-pressed={inIt}
                className="press flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
                <AlbumCover album={a} className="h-11 w-11 shrink-0 rounded-control" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold">{a.name}</span>
                  <span className="block text-caption text-fg-subtle">{plural(a.postIds.length, "post")}</span>
                </span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${inIt ? "border-accent bg-accent text-white" : "border-line-strong"}`} aria-hidden="true">
                  {inIt && <Check size={14} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
