// Brick groups: a few friends compare bricked time privately (like a study
// group). Each member's entry mirrors their verified brickStats and current
// brick; the rules check every number against the real thing.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { myProfile } from "./users.js";

export const MAX_GROUP_MEMBERS = 30;

const groupRef = (id) => doc(db, "brickGroups", id);
const entryRef = (gid, uid) => doc(db, "brickGroups", gid, "members", uid);

export async function fetchMyBrickGroups() {
  if (!me()) return [];
  const snap = await getDocs(query(collection(db, "brickGroups"), where("members", "array-contains", me()), limit(50)));
  return snapToList(snap);
}

export async function fetchBrickGroup(id) {
  const snap = await getDoc(groupRef(id)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Members' mirrored stats, for the group's leaderboard. */
export async function fetchGroupEntries(gid) {
  return snapToList(await getDocs(query(collection(db, "brickGroups", gid, "members"), limit(MAX_GROUP_MEMBERS))));
}

// Copies your verified stats and current brick into one group.
async function writeEntry(gid) {
  const uid = me();
  const [profile, stats, lock] = await Promise.all([
    myProfile(),
    getDoc(doc(db, "brickStats", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
    getDoc(doc(db, "locks", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
  ]);
  await setDoc(entryRef(gid, uid), {
    username: profile?.username || "",
    name: profile?.name || "",
    photoURL: profile?.photoURL || "",
    weekKey: stats?.weekKey || "",
    weekSeconds: stats?.weekSeconds || 0,
    totalSeconds: stats?.totalSeconds || 0,
    streakDays: stats?.streakDays || 0,
    brickedUntil: lock ? lock.self?.until ?? null : null,
    updatedAt: serverTimestamp(),
  });
}

/** Refreshes your entry in every group you're in (after stats change or a brick starts). */
export async function syncMyGroupEntries() {
  const groups = await fetchMyBrickGroups().catch(() => []);
  await Promise.all(groups.map((g) => writeEntry(g.id).catch(() => {})));
}

export async function createBrickGroup(name) {
  const ref_ = await addDoc(collection(db, "brickGroups"), {
    name: name.trim().slice(0, 40), ownerId: me(), members: [me()], createdAt: serverTimestamp(),
  });
  await writeEntry(ref_.id).catch(() => {});
  return ref_.id;
}

export async function joinBrickGroup(group) {
  await updateDoc(groupRef(group.id), { members: arrayUnion(me()) });
  await writeEntry(group.id).catch(() => {});
}

export async function leaveBrickGroup(group) {
  await updateDoc(groupRef(group.id), { members: arrayRemove(me()) });
  await deleteDoc(entryRef(group.id, me())).catch(() => {});
}

/** The owner removes someone. */
export async function removeFromBrickGroup(group, uid) {
  await updateDoc(groupRef(group.id), { members: arrayRemove(uid) });
  await deleteDoc(entryRef(group.id, uid)).catch(() => {});
}

export async function renameBrickGroup(group, name) {
  await updateDoc(groupRef(group.id), { name: name.trim().slice(0, 40) });
}

/** The owner deletes the group and everyone's entries with it. */
export async function deleteBrickGroup(group) {
  const entries = await fetchGroupEntries(group.id).catch(() => []);
  const batch = writeBatch(db);
  entries.forEach((e) => batch.delete(entryRef(group.id, e.id)));
  batch.delete(groupRef(group.id));
  await batch.commit();
}
