// The newsroom desk: journalists file their stories in folders, like OneDrive.
// Kept per journalist in users/{uid}/private/desk as
//   { folders: { id: { name, parent } }, placements: { storyId: folderId } }
// so co-authors each file a shared story where they like. ROOT ("") is the
// top level. Every change returns a new desk.

export const ROOT = "";
export const MAX_FOLDER_NAME = 60;

export const emptyDesk = () => ({ folders: {}, placements: {} });

const exists = (desk, id) => !!id && !!desk.folders[id];
const parentOf = (desk, id) => (exists(desk, desk.folders[id]?.parent) ? desk.folders[id].parent : ROOT);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** The folder a story is filed in; anything filed in a missing folder is at the top. */
export function folderOf(desk, storyId) {
  const f = desk.placements[storyId];
  return exists(desk, f) ? f : ROOT;
}

/** Folders directly inside `parent`, by name. */
export function childFolders(desk, parent = ROOT) {
  return Object.entries(desk.folders)
    .filter(([id]) => parentOf(desk, id) === parent)
    .map(([id, f]) => ({ id, name: f.name }))
    .sort(byName);
}

/** From the top down to `folderId`, as [{ id, name }]. */
export function pathTo(desk, folderId) {
  const path = [];
  const seen = new Set();
  for (let id = folderId; exists(desk, id) && !seen.has(id); id = parentOf(desk, id)) {
    seen.add(id);
    path.unshift({ id, name: desk.folders[id].name });
  }
  return path;
}

/** Every folder inside `folderId`, at any depth. */
export function descendants(desk, folderId) {
  const out = new Set();
  const walk = (id) => childFolders(desk, id).forEach((c) => { if (!out.has(c.id)) { out.add(c.id); walk(c.id); } });
  walk(folderId);
  return out;
}

/** A folder can't go into itself or anything inside it. */
export const canMoveFolder = (desk, folderId, target) =>
  folderId !== target && !descendants(desk, folderId).has(target);

/** `name`, or `name (2)`, `name (3)`... if a sibling already has it. */
export function uniqueName(desk, parent, name, except = null) {
  const taken = new Set(childFolders(desk, parent).filter((f) => f.id !== except).map((f) => f.name.toLowerCase()));
  const base = name.trim().slice(0, MAX_FOLDER_NAME) || "New folder";
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, MAX_FOLDER_NAME - 5)} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function createFolder(desk, { id, name, parent = ROOT }) {
  const at = exists(desk, parent) ? parent : ROOT;
  return { ...desk, folders: { ...desk.folders, [id]: { name: uniqueName(desk, at, name), parent: at } } };
}

export function renameFolder(desk, id, name) {
  if (!exists(desk, id)) return desk;
  const folder = desk.folders[id];
  return { ...desk, folders: { ...desk.folders, [id]: { ...folder, name: uniqueName(desk, parentOf(desk, id), name, id) } } };
}

/** Moves stories and folders into `target`. Folders that can't go there stay put. */
export function moveItems(desk, { stories = [], folders = [] }, target = ROOT) {
  const to = exists(desk, target) ? target : ROOT;
  const placements = { ...desk.placements };
  for (const s of stories) {
    if (to) placements[s] = to;
    else delete placements[s];
  }
  const nextFolders = { ...desk.folders };
  for (const f of folders) {
    if (!exists(desk, f) || !canMoveFolder(desk, f, to)) continue;
    nextFolders[f] = { ...nextFolders[f], parent: to };
  }
  return { folders: nextFolders, placements };
}

/** Deletes a folder. What was inside it moves up to where the folder was. */
export function deleteFolder(desk, id) {
  if (!exists(desk, id)) return desk;
  const up = parentOf(desk, id);
  const folders = {};
  for (const [fid, f] of Object.entries(desk.folders)) {
    if (fid === id) continue;
    folders[fid] = parentOf(desk, fid) === id ? { ...f, parent: up } : f;
  }
  const placements = {};
  for (const [sid, f] of Object.entries(desk.placements)) {
    if (f !== id) placements[sid] = f;
    else if (up) placements[sid] = up;
  }
  return { folders, placements };
}

/** Forgets placements for stories that are gone (deleted, or no longer shared). */
export function prune(desk, storyIds) {
  const keep = new Set(storyIds);
  const placements = Object.fromEntries(Object.entries(desk.placements).filter(([sid, f]) => keep.has(sid) && exists(desk, f)));
  return Object.keys(placements).length === Object.keys(desk.placements).length ? desk : { ...desk, placements };
}

export const newFolderId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
