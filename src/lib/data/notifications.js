// Notifications: likes, comments, reposts, follows, mentions and invites.
//
// There's no server of our own to write them, so the person who acts writes
// the notice into the other person's inbox (users/{uid}/notifications). The
// rules accept it only if the thing it describes really happened (the like,
// comment or follow exists), it's in the actor's own name and photo, and the
// recipient hasn't blocked them. Each action has one fixed id, so liking,
// unliking and liking again can't send a second notice. Notices are
// best-effort: if one can't be written, the action itself still stands.

import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, tsMillis } from "./core.js";
import { fetchProfile } from "./users.js";

export const NOTICE_TYPES = ["like", "comment", "repost", "follow", "request", "accept", "mention", "family", "familyok", "familyask", "invite", "joined"];

/** The fixed id for an action, so the same action never notifies twice. */
export function noticeId(type, { actor, postId = "", commentId = "", ref = "" }) {
  switch (type) {
    case "like": return `like_${postId}_${actor}`;
    case "repost": return `repost_${postId}_${actor}`;
    case "comment": return `comment_${commentId}`;
    case "mention": return `mention_${postId}`;
    case "invite": return `invite_${ref}`;
    case "joined": return `joined_${ref}`;
    default: return `${type}_${actor}`;
  }
}

let mine = null; // { uid, profile } for this visit, so a burst of likes is one read
async function myCard() {
  if (mine?.uid !== me()) mine = { uid: me(), profile: await fetchProfile(me()) };
  return mine.profile;
}
/** Call after changing your own name or photo. */
export function forgetMyCard() { mine = null; }

/** Tell `recipientId` about something you just did. Never throws. */
export async function notify(recipientId, type, { postId = "", commentId = "", text = "", ref = "" } = {}) {
  const actor = me();
  if (!actor || !recipientId || recipientId === actor) return;
  try {
    const p = await myCard();
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

/** Take back a notice when you undo the action (unlike, unfollow). */
export async function unnotify(recipientId, type, opts = {}) {
  const actor = me();
  if (!actor || !recipientId || recipientId === actor) return;
  await deleteDoc(doc(db, "users", recipientId, "notifications", noticeId(type, { actor, ...opts }))).catch(() => {});
}

/** Your latest notifications, live. Returns the unsubscribe function. */
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

/** @handles in a post, lower-cased, at most five (more is a broadcast, not a mention). */
export function mentionedHandles(text) {
  const found = [...String(text || "").matchAll(/(?<![\p{L}\p{N}_.])@([a-z0-9_]{3,30})/giu)].map((m) => m[1].toLowerCase());
  return [...new Set(found)].slice(0, 5);
}

/* Likes and reposts of the same post fold into one line ("@sam and 3
   others"), the way people actually want to read them. Everything else is
   one line each, newest first. */
export function groupNotices(list) {
  const groups = [];
  const byKey = new Map();
  for (const n of list) {
    const key = ["like", "repost"].includes(n.type) ? `${n.type}:${n.postId}` : n.id;
    const g = byKey.get(key);
    if (g) { g.items.push(n); g.unread = g.unread || !n.read; continue; }
    const fresh = { key, type: n.type, items: [n], unread: !n.read, at: tsMillis(n.createdAt) };
    byKey.set(key, fresh);
    groups.push(fresh);
  }
  return groups;
}
