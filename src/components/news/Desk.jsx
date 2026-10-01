import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Ellipsis, FilePen, FileText, Folder, FolderInput, FolderOpen, FolderPlus, LayoutGrid, List,
  Pencil, Plus, Radio, Search as SearchIcon, Trash2, Users, X,
} from "lucide-react";
import { createNewsStory, deleteNews, fetchDesk, saveDesk, setLive, tsMillis, me } from "../../lib/db";
import {
  ROOT, canMoveFolder, childFolders, createFolder, deleteFolder, descendants, folderOf, moveItems, newFolderId, pathTo, prune,
  renameFolder, MAX_FOLDER_NAME,
} from "../../lib/desk";
import { shortTime, plural } from "../../lib/format";
import { navigate } from "../../lib/router";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import MediaImg from "../ui/MediaImg";
import { MenuGroup, MenuItem } from "../ui/Menu";
import Tabs from "../ui/Tabs";
import { Field, Input } from "../ui/Field";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

const PREFS_KEY = "mesh:desk-view";
const DRAG_TYPE = "application/x-mesh-desk";

const readPrefs = () => {
  try { return { layout: "list", sort: "modified", ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
  catch { return { layout: "list", sort: "modified" }; }
};

const modified = (s) => tsMillis(s.updatedAt) || tsMillis(s.createdAt);
const storyName = (s) => s.title || "Untitled story";
const canDelete = (s) => s.status !== "approved" && s.authorId === me();
const openStory = (s) => navigate(s.status === "approved" ? `/news/${s.id}` : `/news/write/${s.id}`);

function status(s) {
  if (s.legalHold) return { label: "Legal review", tone: "warning" };
  if (s.status === "approved") return s.format === "live" && s.live ? { label: "Live", tone: "danger" } : { label: "Published", tone: "success" };
  return { label: "Draft", tone: "neutral" };
}

/**
 * A journalist's stories as a file system, like OneDrive: folders with
 * breadcrumbs, list or grid, multi-select, drag and drop, Move to, rename
 * and delete. Folders are private to the journalist.
 */
export default function Desk({ stories, setStories }) {
  const toast = useToast();
  const [desk, setDesk] = useState(null);
  const [tab, setTab] = useState("mine");
  const [folder, setFolder] = useState(ROOT);
  const [prefs, setPrefs] = useState(readPrefs);
  const [selected, setSelected] = useState(new Set()); // "s:<id>" | "f:<id>"
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null); // { kind, ... }
  const [dropOn, setDropOn] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchDesk().then(setDesk).catch(() => setDesk({ folders: {}, placements: {} }));
  }, []);

  const live = useMemo(() => desk && stories && prune(desk, stories.map((s) => s.id)), [desk, stories]);
  const here = live && live.folders[folder] ? folder : ROOT;

  const setPref = (key, value) => setPrefs((p) => {
    const next = { ...p, [key]: value };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });

  // Folder changes save the whole desk; on failure the old one comes back.
  const commit = async (next) => {
    const prev = desk;
    setDesk(next);
    try { await saveDesk(next); return true; }
    catch {
      setDesk(prev);
      toast({ tone: "error", title: "Couldn't save that change", body: "Check your connection and try again." });
      return false;
    }
  };

  const go = (id) => { setFolder(id); setSelected(new Set()); setTab("mine"); setQuery(""); };

  const startStory = async (format) => {
    setBusy(format);
    try {
      const id = await createNewsStory(format);
      // New stories land in the folder you're in.
      if (here && live) await saveDesk(moveItems(live, { stories: [id] }, here)).catch(() => {});
      navigate(`/news/write/${id}`);
    } catch {
      toast({ tone: "error", title: "Couldn't start a story" });
      setBusy("");
    }
  };

  // What the current view shows.
  const q = query.trim().toLowerCase();
  const sortStories = (list) => [...list].sort(prefs.sort === "name"
    ? (a, b) => storyName(a).localeCompare(storyName(b), undefined, { numeric: true, sensitivity: "base" })
    : (a, b) => modified(b) - modified(a));
  const view = useMemo(() => {
    if (!live || !stories) return null;
    if (q) {
      return {
        flat: true,
        folders: Object.entries(live.folders).filter(([, f]) => f.name.toLowerCase().includes(q)).map(([id, f]) => ({ id, name: f.name })),
        stories: sortStories(stories.filter((s) => storyName(s).toLowerCase().includes(q))),
      };
    }
    if (tab === "recent") return { flat: true, folders: [], stories: [...stories].sort((a, b) => modified(b) - modified(a)).slice(0, 50) };
    if (tab === "shared") return { flat: true, folders: [], stories: sortStories(stories.filter((s) => s.authorId !== me())) };
    return {
      flat: false,
      folders: childFolders(live, here),
      stories: sortStories(stories.filter((s) => folderOf(live, s.id) === here)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, stories, tab, here, q, prefs.sort]);

  if (!live || !view) return <Skeleton className="h-48 !rounded-card" />;

  const path = pathTo(live, here);
  const where = (s) => pathTo(live, folderOf(live, s.id)).map((f) => f.name).join(" › ") || "My stories";
  const countIn = (id) => childFolders(live, id).length + stories.filter((s) => folderOf(live, s.id) === id).length;
  const byId = new Map(stories.map((s) => [s.id, s]));

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const split = (keys) => ({
    stories: [...keys].filter((k) => k.startsWith("s:")).map((k) => k.slice(2)),
    folders: [...keys].filter((k) => k.startsWith("f:")).map((k) => k.slice(2)),
  });

  const move = async (items, target) => {
    const next = moveItems(live, items, target);
    const skipped = items.folders.filter((f) => !canMoveFolder(live, f, target)).length;
    if (await commit(next)) {
      const n = items.stories.length + items.folders.length - skipped;
      toast({ title: `Moved ${plural(n, "item")} to ${target ? live.folders[target].name : "My stories"}`,
        body: skipped ? "A folder can't go inside itself." : undefined });
      setSelected(new Set());
    }
  };

  const remove = async ({ stories: ids, folders }) => {
    setBusy("delete");
    let next = live;
    for (const f of folders) next = deleteFolder(next, f);
    const deletable = ids.map((id) => byId.get(id)).filter((s) => s && canDelete(s));
    let failed = 0;
    const gone = new Set();
    for (const s of deletable) {
      try { await deleteNews(s.id); gone.add(s.id); } catch { failed += 1; }
    }
    if (failed) toast({ tone: "error", title: `Couldn't delete ${plural(failed, "story", "stories")}` });
    else if (gone.size || folders.length) {
      toast({ title: [gone.size && `Deleted ${plural(gone.size, "draft")}`, folders.length && `${plural(folders.length, "folder")} removed`].filter(Boolean).join(", ") });
    }
    setStories((list) => list.filter((s) => !gone.has(s.id)));
    if (folders.length) await commit(next);
    setSelected(new Set());
    setDialog(null);
    setBusy("");
  };

  // Drag a selection (or one item) onto a folder or a breadcrumb.
  const dragProps = (key) => ({
    draggable: true,
    onDragStart: (e) => {
      const keys = selected.has(key) ? [...selected] : [key];
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys));
      e.dataTransfer.effectAllowed = "move";
    },
  });
  const dropProps = (target) => ({
    onDragOver: (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDropOn(target); } },
    onDragLeave: () => setDropOn((d) => (d === target ? null : d)),
    onDrop: (e) => {
      e.preventDefault();
      setDropOn(null);
      try {
        const items = split(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)));
        items.folders = items.folders.filter((f) => f !== target);
        if (items.stories.length || items.folders.length) move(items, target);
      } catch { /* not ours */ }
    },
  });

  const chosen = split(selected);
  const deletableChosen = chosen.stories.filter((id) => byId.get(id) && canDelete(byId.get(id)));
  const empty = !view.folders.length && !view.stories.length;
  const grid = prefs.layout === "grid";

  return (
    <section aria-label="Your stories">
      {/* Command bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Plus} loading={busy === "story"} onClick={() => startStory("story")}>New story</Button>
        <Button icon={Radio} loading={busy === "live"} onClick={() => startStory("live")}>New live blog</Button>
        <Button icon={FolderPlus} onClick={() => setDialog({ kind: "new-folder" })}>New folder</Button>
      </div>

      <Tabs variant="underline" label="Stories" value={q ? "" : tab} onChange={(t) => { setTab(t); setQuery(""); setSelected(new Set()); }}
        tabs={[{ id: "mine", label: "My stories" }, { id: "recent", label: "Recent" }, { id: "shared", label: "Shared with me" }]} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <label htmlFor="desk-search" className="sr-only">Search your stories and folders</label>
          <Input id="desk-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(new Set()); }}
            placeholder="Search stories and folders" className="!min-h-10 !py-2 !pl-9 !text-callout" />
        </div>
        <label htmlFor="desk-sort" className="sr-only">Sort by</label>
        <select id="desk-sort" value={prefs.sort} onChange={(e) => setPref("sort", e.target.value)}
          className="min-h-10 rounded-control border border-field bg-surface-2 px-2 text-callout text-fg">
          <option value="modified">Last modified</option>
          <option value="name">Name</option>
        </select>
        <div className="flex rounded-control bg-surface-2 p-0.5" role="group" aria-label="View">
          <IconButton icon={List} label="List view" size={18} aria-pressed={!grid} className={!grid ? "bg-surface-raised" : ""} onClick={() => setPref("layout", "list")} />
          <IconButton icon={LayoutGrid} label="Grid view" size={18} aria-pressed={grid} className={grid ? "bg-surface-raised" : ""} onClick={() => setPref("layout", "grid")} />
        </div>
      </div>

      {/* Where you are */}
      {!view.flat && (
        <nav aria-label="Folder path" className="mt-3 flex min-h-9 flex-wrap items-center gap-0.5 text-callout">
          <button type="button" onClick={() => go(ROOT)} {...dropProps(ROOT)}
            className={`rounded-control px-2 py-1 font-semibold hover:bg-surface-2 ${dropOn === ROOT ? "bg-accent-soft ring-2 ring-accent-ring" : ""} ${here ? "text-fg-muted" : "text-fg"}`}
            aria-current={here ? undefined : "location"}>
            My stories
          </button>
          {path.map((f, i) => (
            <span key={f.id} className="flex items-center gap-0.5">
              <ChevronRight size={14} className="text-fg-subtle" aria-hidden="true" />
              <button type="button" onClick={() => go(f.id)} {...dropProps(f.id)}
                aria-current={i === path.length - 1 ? "location" : undefined}
                className={`rounded-control px-2 py-1 font-semibold hover:bg-surface-2 ${dropOn === f.id ? "bg-accent-soft ring-2 ring-accent-ring" : ""} ${i === path.length - 1 ? "text-fg" : "text-fg-muted"}`}>
                {f.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      {q && <p className="mt-3 text-caption text-fg-subtle" role="status">{plural(view.folders.length + view.stories.length, "result")} for “{query.trim()}”</p>}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-[1] mt-3 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 shadow-raised" role="toolbar" aria-label="Selected items">
          <span className="mr-auto text-callout font-semibold">{selected.size} selected</span>
          <Button size="sm" icon={FolderInput} onClick={() => setDialog({ kind: "move", items: chosen })}>Move to</Button>
          {(chosen.folders.length > 0 || deletableChosen.length > 0) && (
            <Button size="sm" icon={Trash2} onClick={() => setDialog({ kind: "delete", items: { stories: deletableChosen, folders: chosen.folders } })}>Delete</Button>
          )}
          <IconButton icon={X} label="Clear selection" size={18} onClick={() => setSelected(new Set())} />
        </div>
      )}

      {empty ? (
        <EmptyState compact icon={q ? SearchIcon : tab === "shared" ? Users : here ? FolderOpen : FilePen}
          title={q ? "Nothing matches" : tab === "shared" ? "Nothing shared with you" : here ? "This folder is empty" : "Nothing on your desk yet"}
          body={q ? "Try another word from the headline or folder name."
            : tab === "shared" ? "Stories another journalist adds you to as a co-author show up here."
            : here ? "Start a story here, or drag stories in. You can also select stories and use Move to."
            : "Start a story or live blog. Make folders to keep them organised."} />
      ) : (
        <ul className={grid ? "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" : "mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"}
          aria-label={view.flat ? "Stories" : path.at(-1)?.name || "My stories"}>
          {view.folders.map((f) => (
            <Item key={`f:${f.id}`} grid={grid} itemKey={`f:${f.id}`} selected={selected.has(`f:${f.id}`)} onToggle={toggle}
              name={f.name} icon={Folder} folder dropping={dropOn === f.id}
              meta={view.flat ? pathTo(live, f.id).slice(0, -1).map((p) => p.name).join(" › ") || "My stories" : plural(countIn(f.id), "item")}
              onOpen={() => go(f.id)} onMenu={() => setDialog({ kind: "folder-menu", id: f.id })}
              drag={dragProps(`f:${f.id}`)} drop={dropProps(f.id)} />
          ))}
          {view.stories.map((s) => {
            const st = status(s);
            return (
              <Item key={`s:${s.id}`} grid={grid} itemKey={`s:${s.id}`} selected={selected.has(`s:${s.id}`)} onToggle={toggle}
                name={storyName(s)} icon={s.format === "live" ? Radio : FileText} cover={s.coverUrl}
                badge={<Badge tone={st.tone}>{st.label}</Badge>}
                meta={[
                  shortTime(modified(s)),
                  (s.authors || []).length > 1 && `with ${(s.authorNames || []).filter((_, i) => (s.authors || [])[i] !== me()).map((n) => `@${n}`).join(", ")}`,
                  view.flat && where(s),
                ].filter(Boolean).join(" · ")}
                onOpen={() => openStory(s)} onMenu={() => setDialog({ kind: "story-menu", id: s.id })}
                drag={dragProps(`s:${s.id}`)} />
            );
          })}
        </ul>
      )}

      {/* Dialogs */}
      {dialog?.kind === "story-menu" && byId.get(dialog.id) && (() => {
        const s = byId.get(dialog.id);
        return (
          <Dialog title={storyName(s)} onClose={() => setDialog(null)}>
            <MenuGroup>
              <MenuItem icon={FilePen} onClick={() => { setDialog(null); openStory(s); }}>{s.status === "approved" ? "Open story" : "Open in editor"}</MenuItem>
              <MenuItem icon={FolderInput} description={`In ${where(s)}`} onClick={() => setDialog({ kind: "move", items: { stories: [s.id], folders: [] } })}>Move to</MenuItem>
              {s.format === "live" && s.status === "approved" && (
                <MenuItem icon={Radio} onClick={async () => {
                  setDialog(null);
                  try { await setLive(s.id, !s.live); setStories((l) => l.map((x) => (x.id === s.id ? { ...x, live: !s.live } : x))); }
                  catch { toast({ tone: "error", title: "Couldn't change that" }); }
                }}>{s.live ? "End live" : "Go live"}</MenuItem>
              )}
              {canDelete(s) && (
                <MenuItem icon={Trash2} danger onClick={() => setDialog({ kind: "delete", items: { stories: [s.id], folders: [] } })}>Delete draft</MenuItem>
              )}
            </MenuGroup>
            {s.status !== "approved" && s.authorId !== me() && (
              <p className="px-3 pt-3 text-caption text-fg-subtle">Only the lead journalist, @{(s.authorNames || [])[0]}, can delete this draft.</p>
            )}
            {s.status === "approved" && (
              <p className="px-3 pt-3 text-caption text-fg-subtle">Published stories stay up with their corrections. Ask an administrator if one has to come down.</p>
            )}
          </Dialog>
        );
      })()}

      {dialog?.kind === "folder-menu" && live.folders[dialog.id] && (
        <Dialog title={live.folders[dialog.id].name} onClose={() => setDialog(null)}>
          <MenuGroup>
            <MenuItem icon={FolderOpen} onClick={() => { setDialog(null); go(dialog.id); }}>Open</MenuItem>
            <MenuItem icon={Pencil} onClick={() => setDialog({ kind: "rename", id: dialog.id })}>Rename</MenuItem>
            <MenuItem icon={FolderInput} onClick={() => setDialog({ kind: "move", items: { stories: [], folders: [dialog.id] } })}>Move to</MenuItem>
            <MenuItem icon={Trash2} danger description="Anything inside moves up a level. No stories are deleted"
              onClick={() => setDialog({ kind: "delete", items: { stories: [], folders: [dialog.id] } })}>Delete folder</MenuItem>
          </MenuGroup>
        </Dialog>
      )}

      {(dialog?.kind === "new-folder" || dialog?.kind === "rename") && (
        <NameDialog title={dialog.kind === "rename" ? "Rename folder" : "New folder"}
          initial={dialog.kind === "rename" ? live.folders[dialog.id]?.name : ""}
          action={dialog.kind === "rename" ? "Rename" : "Create"}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            const ok = await commit(dialog.kind === "rename"
              ? renameFolder(live, dialog.id, name)
              : createFolder(live, { id: newFolderId(), name, parent: here }));
            if (ok) setDialog(null);
          }} />
      )}

      {dialog?.kind === "move" && (
        <MoveDialog desk={live} items={dialog.items} start={here} onClose={() => setDialog(null)}
          onMove={async (target) => { setDialog(null); await move(dialog.items, target); }} />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog busy={busy === "delete"}
          title={dialog.items.stories.length && !dialog.items.folders.length
            ? (dialog.items.stories.length === 1 ? `Delete “${storyName(byId.get(dialog.items.stories[0]) || {})}”?` : `Delete ${plural(dialog.items.stories.length, "draft")}?`)
            : `Delete ${plural(dialog.items.folders.length + dialog.items.stories.length, "item")}?`}
          confirmLabel="Delete"
          body={[
            dialog.items.stories.length > 0 && `${dialog.items.stories.length === 1 ? "The draft and its history" : "These drafts and their history"} will be permanently deleted. This can't be undone.`,
            dialog.items.folders.length > 0 && `Anything inside ${dialog.items.folders.length === 1 ? "the folder" : "these folders"} moves up a level.`,
            chosen.stories.length > deletableChosen.length && selected.size > 0 && "Published stories and drafts led by someone else aren't deleted.",
          ].filter(Boolean).join(" ")}
          onClose={() => setDialog(null)} onConfirm={() => remove(dialog.items)} />
      )}
    </section>
  );
}

function Item({ grid, itemKey, selected, onToggle, name, icon: Icon, folder = false, cover, badge, meta, onOpen, onMenu, drag, drop, dropping }) {
  const check = (
    <input type="checkbox" checked={selected} onChange={() => onToggle(itemKey)} aria-label={`Select ${name}`}
      className="h-5 w-5 shrink-0 cursor-pointer accent-[#7c3aed]" />
  );
  const ring = dropping ? "ring-2 ring-accent-ring bg-accent-soft" : selected ? "bg-accent-soft" : "";
  if (grid) {
    return (
      <li {...drag} {...drop} className={`group relative overflow-hidden rounded-card border border-line bg-surface ${ring}`}>
        <button type="button" onClick={onOpen} className="press block w-full text-left" aria-label={`Open ${name}`}>
          <span className="flex aspect-[4/3] items-center justify-center bg-surface-2">
            {cover ? <MediaImg src={cover} alt="" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
              : <Icon size={40} strokeWidth={1.5} className={folder ? "fill-accent/20 text-accent-text" : "text-fg-subtle"} aria-hidden="true" />}
          </span>
          <span className="block p-3">
            <span className="line-clamp-2 block text-callout font-semibold">{name}</span>
            <span className="mt-1 block truncate text-caption text-fg-subtle">{meta}</span>
            {badge && <span className="mt-1.5 block">{badge}</span>}
          </span>
        </button>
        <span className="absolute left-2 top-2">{check}</span>
        <IconButton icon={Ellipsis} label={`More options for ${name}`} tone="overlay" size={16} className="absolute right-1.5 top-1.5" onClick={onMenu} />
      </li>
    );
  }
  return (
    <li {...drag} {...drop} className={`flex items-center gap-3 px-3 py-2 ${ring}`}>
      {check}
      <button type="button" onClick={onOpen} className="press flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
        <Icon size={22} strokeWidth={1.75} className={`shrink-0 ${folder ? "fill-accent/20 text-accent-text" : "text-fg-subtle"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-semibold">{name}</span>
          <span className="block truncate text-caption text-fg-subtle">{meta}</span>
        </span>
        {badge && <span className="hidden shrink-0 sm:block">{badge}</span>}
      </button>
      <IconButton icon={Ellipsis} label={`More options for ${name}`} size={18} onClick={onMenu} />
    </li>
  );
}

function NameDialog({ title, initial, action, onSave, onClose }) {
  const [name, setName] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim());
    setBusy(false);
  };
  return (
    <Dialog title={title} onClose={onClose} variant="center" size="sm">
      <form onSubmit={save}>
        <Field label="Folder name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_FOLDER_NAME} placeholder="e.g. Elections 2026" />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>{action}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Browse to a folder and move there. Folders can't go inside themselves. */
function MoveDialog({ desk, items, start, onMove, onClose }) {
  const [at, setAt] = useState(start);
  const blocked = new Set(items.folders.flatMap((f) => [f, ...descendants(desk, f)]));
  const path = pathTo(desk, at);
  const n = items.stories.length + items.folders.length;
  return (
    <Dialog title={`Move ${plural(n, "item")}`} onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={FolderInput} disabled={blocked.has(at)} onClick={() => onMove(at)}>
            Move to {at ? desk.folders[at].name : "My stories"}
          </Button>
        </div>
      )}>
      <nav aria-label="Folder path" className="mb-2 flex flex-wrap items-center gap-0.5 text-callout">
        <button type="button" onClick={() => setAt(ROOT)} className={`rounded-control px-2 py-1 font-semibold hover:bg-surface-2 ${at ? "text-fg-muted" : "text-fg"}`}>My stories</button>
        {path.map((f) => (
          <span key={f.id} className="flex items-center gap-0.5">
            <ChevronRight size={14} className="text-fg-subtle" aria-hidden="true" />
            <button type="button" onClick={() => setAt(f.id)} className="rounded-control px-2 py-1 font-semibold hover:bg-surface-2">{f.name}</button>
          </span>
        ))}
      </nav>
      {childFolders(desk, at).length === 0 ? (
        <p className="rounded-control bg-surface-2 px-4 py-6 text-center text-caption text-fg-subtle">No folders in here.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {childFolders(desk, at).map((f) => (
            <li key={f.id}>
              <button type="button" disabled={blocked.has(f.id)} onClick={() => setAt(f.id)}
                className="press flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-surface-2 disabled:opacity-40">
                <Folder size={20} className="shrink-0 fill-accent/20 text-accent-text" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-callout font-medium">{f.name}</span>
                {blocked.has(f.id) ? <span className="text-caption text-fg-subtle">Moving</span> : <ChevronRight size={16} className="text-fg-subtle" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
