// Notifications are written client-side by the actor into the recipient's
// inbox. The rules (noticeHappened) verify the underlying action exists and
// the actor's name/photo; ids are deterministic per action so repeats
// overwrite rather than duplicate. Failures are swallowed: the action stands.

import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, tsMillis } from "./core.js";
import { myProfile } from "./users.js";

export const NOTICE_TYPES = ["like", "comment", "repost", "follow", "request", "accept", "mention", "family", "familyok", "familyask", "invite", "joined", "storylike", "echo"];

export function noticeId(type, { actor, postId = "", commentId = "", ref = "" }) {
  switch (type) {
    case "like": return `like_${postId}_${actor}`;
    case "repost": return `repost_${postId}_${actor}`;
    case "comment": return `comment_${commentId}`;
    case "mention": return `mention_${postId}`;
    case "invite": return `invite_${ref}`;
    case "joined": return `joined_${ref}`;
    case "storylike": return `storylike_${ref}_${actor}`;
    case "echo": return `echo_${commentId}`;
    default: return `${type}_${actor}`;
  }
}

/** Never throws. */
export async function notify(recipientId, type, { postId = "", commentId = "", text = "", ref = "" } = {}) {
  const actor = me();
  if (!actor || !recipientId || recipientId === actor) return;
  try {
    const p = await myProfile();
    await setDoc(doc(db, "users", recipientId, "notifications", noticeId(type, { actor, postId, commentId, ref })), {
      type,
      actorId: actor,
      actorName: p?.username || "",
      actorPhoto: p?.photoURL || "",
      postId,
      commentId,
      ref,
      text: String(text || "").slice(0, 140),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch { /* already sent, or not allowed (blocked): the action stands either way */ }
}

export async function unnotify(recipientId, type, opts = {}) {
  const actor = me();
  if (!actor || !recipientId || recipientId === actor) return;
  await deleteDoc(doc(db, "users", recipientId, "notifications", noticeId(type, { actor, ...opts }))).catch(() => {});
}

export function listenNotifications(onChange, max = 60) {
  const q = query(collection(db, "users", me(), "notifications"), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => onChange([]));
}

export async function markNoticesRead(list) {
  const unread = list.filter((n) => !n.read).slice(0, 450);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, "users", me(), "notifications", n.id), { read: true }));
  await batch.commit();
}

export async function deleteNotices(ids) {
  if (!ids.length) return;
  const batch = writeBatch(db);
  ids.slice(0, 450).forEach((id) => batch.delete(doc(db, "users", me(), "notifications", id)));
  await batch.commit();
}

/** Lower-cased @handles, capped at five. */
export function mentionedHandles(text) {
  const found = [...String(text || "").matchAll(/(?<![\p{L}\p{N}_.])@([a-z0-9_]{3,30})/giu)].map((m) => m[1].toLowerCase());
  return [...new Set(found)].slice(0, 5);
}

// Likes and reposts of the same target collapse into one row.
export function groupNotices(list) {
  const groups = [];
  const byKey = new Map();
  for (const n of list) {
    const key = ["like", "repost"].includes(n.type) ? `${n.type}:${n.postId}`
      : n.type === "storylike" ? `storylike:${n.ref}` : n.id;
    const g = byKey.get(key);
    if (g) { g.items.push(n); g.unread = g.unread || !n.read; continue; }
    const fresh = { key, type: n.type, items: [n], unread: !n.read, at: tsMillis(n.createdAt) };
    byKey.set(key, fresh);
    groups.push(fresh);
  }
  return groups;
}
