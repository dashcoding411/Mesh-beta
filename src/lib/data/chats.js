// Conversations, messages, reactions, typing, read state, polls and thoughts.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, limit,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { storeChatPhoto, storeVoiceNote } from "../media";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchProfile, myProfile } from "./users.js";

// Every bubble colour keeps white text at WCAG AA contrast (4.5:1+).
export const CHAT_THEMES = {
  default: { label: "Default", bubble: "bg-violet-600",  swatch: "#7c3aed" }, // 5.7:1
  ocean:   { label: "Ocean",   bubble: "bg-sky-700",     swatch: "#0369a1" }, // 5.9:1
  sunset:  { label: "Sunset",  bubble: "bg-orange-700",  swatch: "#c2410c" }, // 5.2:1
  forest:  { label: "Forest",  bubble: "bg-emerald-700", swatch: "#047857" }, // 5.5:1
  mono:    { label: "Mono",    bubble: "bg-zinc-700",    swatch: "#3f3f46" }, // 10.4:1
};

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

function chatDoc(chatId) {
  return doc(db, "chats", chatId);
}

/** Rejects with a user-facing message if the other person doesn't accept messages from the caller. */
export async function openDirectChat(target) {
  const uid = me();
  const chatId = [uid, target.id].sort().join("_");
  const ref = chatDoc(chatId);
  const snap = await getDoc(ref);
  if (snap.exists()) return chatId;
  const [mine, theirs] = await Promise.all([myProfile(), fetchProfile(target.id)]);
  try {
    await setDoc(ref, {
      members: [uid, target.id].sort(),
      memberNames: { [uid]: mine?.username || "?", [target.id]: theirs?.username || target.username || "?" },
      isGroup: false,
      name: "",
      nicknames: {},
      theme: "default",
      pinnedBy: [],
      mutedBy: [],
      lastMessage: "",
      lastSenderId: "",
      createdBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new Error(`You can't message @${target.username || "this person"}. They only take messages from people they follow.`);
    }
    throw err;
  }
  return chatId;
}

// Members are added one write at a time so the rules can vet each add.
// Resolves to { id, skipped }.
export async function createGroupChat(name, targets, extra = {}) {
  const uid = me();
  const mine = await myProfile();
  const refDoc = await addDoc(collection(db, "chats"), {
    members: [uid],
    admins: [uid],
    memberNames: { [uid]: mine?.username || "?" },
    isGroup: true,
    name,
    nicknames: {},
    theme: "default",
    pinnedBy: [],
    mutedBy: [],
    lastMessage: "",
    lastSenderId: "",
    createdBy: uid,
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const skipped = await addToGroup(refDoc.id, targets);
  return { id: refDoc.id, skipped };
}

export async function addToGroup(chatId, users) {
  const skipped = [];
  for (const u of users) {
    try {
      await updateDoc(chatDoc(chatId), { members: arrayUnion(u.id), [`memberNames.${u.id}`]: u.username || "?" });
    } catch {
      skipped.push(u);
    }
  }
  return skipped;
}

export function groupAdmins(chat) {
  return chat.admins || [chat.createdBy];
}

export async function removeFromGroup(chat, uid) {
  await updateDoc(chatDoc(chat.id), {
    members: arrayRemove(uid),
    admins: groupAdmins(chat).filter((a) => a !== uid),
    [`memberNames.${uid}`]: deleteField(),
  });
}

export async function setGroupAdmin(chat, uid, on) {
  const admins = new Set(groupAdmins(chat));
  if (on) admins.add(uid); else admins.delete(uid);
  await updateDoc(chatDoc(chat.id), { admins: [...admins] });
}

// A sole admin leaving promotes the next member.
export async function leaveGroupChat(chat) {
  const uid = me();
  const rest = chat.members.filter((m) => m !== uid);
  let admins = groupAdmins(chat).filter((a) => a !== uid && rest.includes(a));
  if (!admins.length && rest.length && groupAdmins(chat).includes(uid)) admins = [rest[0]];
  const fields = { members: arrayRemove(uid), [`memberNames.${uid}`]: deleteField() };
  if (groupAdmins(chat).includes(uid)) fields.admins = admins;
  await updateDoc(chatDoc(chat.id), fields);
}

export async function renameGroupChat(chatId, name) {
  await updateDoc(chatDoc(chatId), { name });
}

export function listenChats(callback) {
  const q = query(collection(db, "chats"), where("members", "array-contains", me()), orderBy("updatedAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    const uid = me();
    const chats = snapToList(snap).sort((a, b) => {
      const ap = (a.pinnedBy || []).includes(uid) ? 1 : 0;
      const bp = (b.pinnedBy || []).includes(uid) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return tsMillis(b.updatedAt) - tsMillis(a.updatedAt);
    });
    callback(chats);
  });
}

// `pending` marks messages not yet on the server.
export function listenMessages(chatId, callback) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"), limit(300));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites })));
  });
}

export async function sendVoiceMessage(chatId, blob, duration, peaks) {
  const mediaId = await storeVoiceNote(chatId, blob, duration);
  await sendMessage(chatId, "", { voice: { mediaId, duration: Math.round(duration), peaks } });
}

export async function sendPhotoMessage(chatId, file) {
  const photo = await storeChatPhoto(chatId, file);
  await sendMessage(chatId, "", { photo });
}

export async function sendMessage(chatId, text, extras = {}) {
  const uid = me();
  const msg = {
    senderId: uid,
    text,
    reactions: {},
    createdAt: serverTimestamp(),
    ...extras,
  };
  await addDoc(collection(db, "chats", chatId, "messages"), msg);
  await updateDoc(chatDoc(chatId), {
    lastMessage: (extras.poll ? `Poll: ${extras.poll.question}`
      : extras.voice ? `Voice message · ${Math.floor(extras.voice.duration / 60)}:${String(extras.voice.duration % 60).padStart(2, "0")}`
      : extras.gif ? "Sent a GIF"
      : extras.photo ? "Sent a photo"
      : extras.call ? extras.call.summary
      : extras.storyReply ? `Story reply: ${text}`
      : text).slice(0, 80),
    lastSenderId: uid,
    updatedAt: serverTimestamp(),
  });
  await clearTyping(chatId).catch(() => {});
}

// Edit and unsend

export function canEdit(msg) {
  return msg.senderId === me() && !msg.deleted && Date.now() - tsMillis(msg.createdAt) < EDIT_WINDOW_MS;
}

export async function editMessage(chatId, msg, text) {
  if (!canEdit(msg)) throw new Error("Messages can only be edited within 15 minutes.");
  await updateDoc(doc(db, "chats", chatId, "messages", msg.id), {
    text,
    editedAt: serverTimestamp(),
  });
}

// Unsend leaves a tombstone rather than deleting the message.
export async function unsendMessage(chatId, msg, { latest = false } = {}) {
  await updateDoc(doc(db, "chats", chatId, "messages", msg.id), {
    text: "",
    deleted: true,
    sharedPost: deleteField(),
    gif: deleteField(),
    voice: deleteField(),
    photo: deleteField(),
  });
  const mediaId = msg.voice?.mediaId || msg.photo?.mediaId;
  if (mediaId) await deleteDoc(doc(db, "chats", chatId, "media", mediaId)).catch(() => {});
  if (latest) await updateDoc(chatDoc(chatId), { lastMessage: "Unsent a message" }).catch(() => {});
}

// Reactions are { uid: emoji } so the rules can restrict writes to the caller's key.

export async function reactToMessage(chatId, msg, emoji) {
  const uid = me();
  const current = msg.reactions?.[uid];
  await updateDoc(doc(db, "chats", chatId, "messages", msg.id), {
    [`reactions.${uid}`]: current === emoji ? deleteField() : emoji,
  });
}

export function groupReactions(reactions = {}) {
  const byEmoji = new Map();
  for (const [uid, emoji] of Object.entries(reactions)) {
    if (!byEmoji.has(emoji)) byEmoji.set(emoji, []);
    byEmoji.get(emoji).push(uid);
  }
  return [...byEmoji.entries()].map(([emoji, uids]) => ({ emoji, uids, mine: uids.includes(me()) }));
}

// Typing and presence

let lastTypingWrite = 0;

export async function setTyping(chatId) {
  // Throttled to avoid a write per keystroke.
  if (Date.now() - lastTypingWrite < 3000) return;
  lastTypingWrite = Date.now();
  await setDoc(doc(db, "chats", chatId, "typing", me()), { at: serverTimestamp() });
}

export async function clearTyping(chatId) {
  lastTypingWrite = 0;
  await deleteDoc(doc(db, "chats", chatId, "typing", me()));
}

export function listenTyping(chatId, callback) {
  return onSnapshot(collection(db, "chats", chatId, "typing"), (snap) => {
    const fresh = snap.docs
      .filter((d) => d.id !== me() && Date.now() - tsMillis(d.data().at) < 8000)
      .map((d) => d.id);
    callback(fresh);
  });
}

let lastPresenceWrite = 0;

export async function touchPresence() {
  if (Date.now() - lastPresenceWrite < 60000) return;
  lastPresenceWrite = Date.now();
  await setDoc(doc(db, "presence", me()), { at: serverTimestamp() }, { merge: true }).catch(() => {});
}

export function listenPresence(uids, callback) {
  const unsubs = uids.map((uid) =>
    onSnapshot(doc(db, "presence", uid), (snap) => {
      callback(uid, snap.exists() ? tsMillis(snap.data().at) : 0);
    })
  );
  return () => unsubs.forEach((u) => u());
}

export function presenceLabel(atMs) {
  if (!atMs) return "";
  const mins = Math.floor((Date.now() - atMs) / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  return "";
}

// Read state. reads/{uid} holds when each member last read the chat (`at`)
// and when their app last received a message in it (`deliveredAt`).

export async function markRead(chatId) {
  await setDoc(doc(db, "chats", chatId, "reads", me()), { at: serverTimestamp() }, { merge: true });
}

export async function markUnread(chatId) {
  await setDoc(doc(db, "chats", chatId, "reads", me()), { at: Timestamp.fromMillis(0) }, { merge: true });
}

export async function markDelivered(chatId) {
  await setDoc(doc(db, "chats", chatId, "reads", me()), { deliveredAt: serverTimestamp() }, { merge: true });
}

/** uid -> { at, deliveredAt } in millis. */
export function listenReads(chatId, callback) {
  return onSnapshot(collection(db, "chats", chatId, "reads"), (snap) => {
    const map = new Map();
    snap.docs.forEach((d) => map.set(d.id, { at: tsMillis(d.data().at), deliveredAt: tsMillis(d.data().deliveredAt) }));
    callback(map);
  });
}

/** chatId -> { at, deliveredAt } in millis for the signed-in user. */
export async function fetchMyReadTimes(chatIds) {
  const uid = me();
  const map = new Map();
  await Promise.all(
    chatIds.map(async (id) => {
      const snap = await getDoc(doc(db, "chats", id, "reads", uid));
      const data = snap.exists() ? snap.data() : {};
      map.set(id, { at: tsMillis(data.at), deliveredAt: tsMillis(data.deliveredAt) });
    })
  );
  return map;
}

// Inbox

export async function togglePin(chat, pinnedCount) {
  const uid = me();
  const pinned = (chat.pinnedBy || []).includes(uid);
  if (!pinned && pinnedCount >= 3) throw new Error("You can pin up to 3 chats.");
  await updateDoc(chatDoc(chat.id), {
    pinnedBy: pinned ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function toggleMute(chat) {
  const uid = me();
  const muted = (chat.mutedBy || []).includes(uid);
  await updateDoc(chatDoc(chat.id), {
    mutedBy: muted ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function setChatTheme(chatId, theme) {
  await updateDoc(chatDoc(chatId), { theme });
}

export async function setNickname(chatId, uid, nickname) {
  await updateDoc(chatDoc(chatId), {
    [`nicknames.${uid}`]: nickname || deleteField(),
  });
}

// A request is a chat started by someone the user doesn't follow.
export function isRequest(chat, followingSet) {
  const uid = me();
  return chat.createdBy !== uid && !followingSet.has(chat.createdBy);
}

// Polls

export async function sendPoll(chatId, question, options) {
  await sendMessage(chatId, "", {
    poll: { question, options: options.map((o) => ({ text: o })), votes: {} },
  });
}

export async function votePoll(chatId, msg, optionIndex) {
  const uid = me();
  const current = msg.poll?.votes?.[uid];
  await updateDoc(doc(db, "chats", chatId, "messages", msg.id), {
    [`poll.votes.${uid}`]: current === optionIndex ? deleteField() : optionIndex,
  });
}

// Thoughts (60 chars, 24h)

export async function setThought(text) {
  const profile = await myProfile();
  await setDoc(doc(db, "thoughts", me()), {
    text: text.slice(0, 60),
    username: profile?.username || "",
    createdAt: serverTimestamp(),
  });
}

export async function clearThought() {
  await deleteDoc(doc(db, "thoughts", me())).catch(() => {});
}

export async function fetchThoughts(uids) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const results = await Promise.all(
    uids.map(async (uid) => {
      const snap = await getDoc(doc(db, "thoughts", uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return tsMillis(data.createdAt) > cutoff ? { uid, ...data } : null;
    })
  );
  return results.filter(Boolean);
}
