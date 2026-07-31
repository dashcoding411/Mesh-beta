// Firestore/Storage data helpers shared across pages.
import { auth, db, storage } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
  increment,
  serverTimestamp,
  writeBatch,
  documentId,
  onSnapshot,
  Timestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

export function tsMillis(t) {
  return t?.toMillis ? t.toMillis() : 0;
}

export function timeAgo(t) {
  const ms = tsMillis(t);
  if (!ms) return "just now";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function snapToList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function me() {
  return auth.currentUser?.uid;
}

// ---------- users & profiles ----------

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function claimUsernameAndCreateProfile(user, username, birthYear, displayName) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid: user.uid });
  batch.set(doc(db, "users", user.uid), {
    username,
    name: displayName || username,
    usernameChangedAt: null,
    email: user.email || "",
    phone: user.phoneNumber || "",
    bio: "",
    pronouns: "",
    town: "",
    spouseUsername: "",
    birthYear: birthYear || 0,
    photoURL: user.photoURL || "",
    followerCount: 0,
    followingCount: 0,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function usernameTaken(username) {
  const snap = await getDoc(doc(db, "usernames", username));
  return snap.exists();
}

export async function updateProfileFields(uid, fields) {
  await updateDoc(doc(db, "users", uid), fields);
}

// Handles are unique and rate-limited; display names are free-form and may
// repeat, so two people can both be "Alex Nguyen" with different handles.
export const USERNAME_COOLDOWN_DAYS = 30;

export function usernameCooldown(profile) {
  const last = tsMillis(profile?.usernameChangedAt);
  if (!last) return { canChange: true, daysLeft: 0 };
  const elapsedDays = (Date.now() - last) / 86400000;
  const daysLeft = Math.ceil(USERNAME_COOLDOWN_DAYS - elapsedDays);
  return daysLeft > 0
    ? { canChange: false, daysLeft, nextChange: new Date(last + USERNAME_COOLDOWN_DAYS * 86400000) }
    : { canChange: true, daysLeft: 0 };
}

export async function changeUsername(profile, nextUsername) {
  const { canChange, daysLeft } = usernameCooldown(profile);
  if (!canChange) throw new Error(`You can change your handle again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
  if (nextUsername === profile.username) throw new Error("That's already your handle.");
  if (await usernameTaken(nextUsername)) throw new Error("That handle is taken.");

  const uid = me();
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", nextUsername), { uid });
  batch.delete(doc(db, "usernames", profile.username));
  batch.update(doc(db, "users", uid), {
    username: nextUsername,
    usernameChangedAt: serverTimestamp(),
  });
  await batch.commit();
  return nextUsername;
}

export function isMinor(profile) {
  const y = profile?.birthYear || 0;
  return y > 0 && new Date().getFullYear() - y < 16;
}

export async function uploadAvatar(file, onProgress) {
  const { url } = await uploadMedia(file, onProgress, "avatars");
  await updateDoc(doc(db, "users", me()), { photoURL: url });
  return url;
}

// ---------- media upload ----------

// Thrown when the Firebase project has no Storage bucket provisioned, which
// happens on the free Spark plan — Cloud Storage requires the Blaze plan.
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Media uploads aren't enabled yet. Cloud Storage needs the Firebase Blaze plan — " +
        "text posts work fine in the meantime."
    );
    this.name = "StorageUnavailableError";
  }
}

// Probed once per session so the composer can tell the user *why* posting is
// blocked instead of failing at the end of a form.
let storageOk = null;

export async function storageAvailable() {
  if (storageOk !== null) return storageOk;
  try {
    const probe = ref(storage, `uploads/${me()}/.probe`);
    await getDownloadURL(probe);
    storageOk = true;
  } catch (err) {
    // "object not found" means the bucket exists and answered — that's a pass.
    storageOk = err?.code === "storage/object-not-found";
  }
  return storageOk;
}

function isBucketMissing(err) {
  const code = err?.code || "";
  return (
    code === "storage/unknown" ||
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/unauthorized"
  );
}

export function uploadMedia(file, onProgress, folder = "uploads") {
  const uid = me();
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-80);
  const path = `${folder}/${uid}/${Date.now()}-${safeName}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(isBucketMissing(err) ? new StorageUnavailableError() : err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path });
      }
    );
  });
}

// ---------- posts ----------

export async function createPost({ kind, text, title, mediaUrl, mediaPath, mediaType, groupId, visibility }) {
  const user = auth.currentUser;
  const profile = await fetchProfile(user.uid);
  const post = {
    kind, // 'post' | 'short' | 'video'
    authorId: user.uid,
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "unknown",
    authorPhoto: profile?.photoURL || "",
    text: text || "",
    title: title || "",
    mediaUrl: mediaUrl || "",
    mediaPath: mediaPath || "",
    mediaType: mediaType || "",
    groupId: groupId || "",
    visibility: visibility || "public",
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    sendCount: 0,
    viewCount: 0,
    completeCount: 0,
    createdAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "posts"), post);
  return { id: refDoc.id, ...post, createdAt: Timestamp.now() };
}

// Every posts query below must satisfy the `list` rule in firestore.rules
// statically: constrain visibility == 'public', or authorId to your own uid.
// Dropping either constraint makes Firestore reject the whole query.

const byNewest = (a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt);

export async function fetchFeed() {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("groupId", "==", ""),
    limit(150)
  );
  return snapToList(await getDocs(q)).sort(byNewest);
}

export async function fetchPostsByKind(kind) {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("kind", "==", kind),
    limit(150)
  );
  return snapToList(await getDocs(q))
    .filter((p) => !p.groupId)
    .sort(byNewest);
}

export async function fetchPostsByAuthor(uid) {
  // Your own profile shows followers-only posts too; someone else's shows public only.
  const q =
    uid === me()
      ? query(collection(db, "posts"), where("authorId", "==", uid), limit(100))
      : query(
          collection(db, "posts"),
          where("visibility", "==", "public"),
          where("authorId", "==", uid),
          limit(100)
        );
  return snapToList(await getDocs(q)).sort(byNewest);
}

export async function fetchGroupPosts(groupId) {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("groupId", "==", groupId),
    limit(100)
  );
  return snapToList(await getDocs(q)).sort(byNewest);
}

export async function deletePost(post) {
  await deleteDoc(doc(db, "posts", post.id));
  if (post.mediaPath) {
    try {
      await deleteObject(ref(storage, post.mediaPath));
    } catch {
      // media may already be gone; the post delete is what matters
    }
  }
}

// ---------- likes (one per user) + affinity signals ----------

export async function fetchMyLikes(postIds) {
  const uid = me();
  const liked = new Set();
  await Promise.all(
    postIds.map(async (id) => {
      const snap = await getDoc(doc(db, "posts", id, "likes", uid));
      if (snap.exists()) liked.add(id);
    })
  );
  return liked;
}

// Signal weights, blended from what each of the big four actually optimises:
//   TikTok  — passive watch signals (completion, replay) map interest fast
//   Instagram — a "send" to a friend is the strongest taste signal there is
//   Facebook — comments and replies mean meaningful social interaction
//   YouTube — a click that turns into sustained watch time beats a bare click
export const SIGNAL = {
  hide: -8,        // explicit "not interested" — the strongest negative
  skip: -1,        // scrolled away almost immediately
  view: 0.25,      // watched a meaningful chunk
  complete: 1,     // watched to the end
  replay: 1.5,     // watched again — strong intent
  like: 1,
  comment: 2,      // MSI: conversation beats a tap
  save: 3,
  send: 4,         // the Instagram "sends" economy
  follow: 5,
};

export async function recordSignal(post, kind) {
  const weight = SIGNAL[kind];
  if (!weight || !post?.authorId) return;
  await bumpAffinity(post.authorId, weight).catch(() => {});
}

async function bumpAffinity(authorId, amount) {
  if (!authorId || authorId === me()) return;
  await setDoc(
    doc(db, "users", me(), "affinity", authorId),
    { score: increment(amount), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function toggleLike(post, currentlyLiked) {
  const uid = me();
  const likeRef = doc(db, "posts", post.id, "likes", uid);
  const postRef = doc(db, "posts", post.id);
  if (currentlyLiked) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likeCount: increment(-1) });
  } else {
    await setDoc(likeRef, { createdAt: serverTimestamp() });
    await updateDoc(postRef, { likeCount: increment(1) });
    bumpAffinity(post.authorId, SIGNAL.like).catch(() => {});
  }
}

export async function fetchAffinity() {
  const q = query(collection(db, "users", me(), "affinity"), limit(200));
  const map = new Map();
  (await getDocs(q)).docs.forEach((d) => map.set(d.id, d.data().score || 0));
  return map;
}

// ---------- saves & sends ----------
// These are the two strongest positive signals in the ranker: a save is a
// private bookmark, a send is passing something to a specific person. Both
// cost the user more than a like, so both are weighted above it.

export async function fetchMySaves(postIds) {
  const uid = me();
  const saved = new Set();
  await Promise.all(
    postIds.map(async (id) => {
      const snap = await getDoc(doc(db, "posts", id, "saves", uid));
      if (snap.exists()) saved.add(id);
    })
  );
  return saved;
}

export async function toggleSave(post, currentlySaved) {
  const uid = me();
  const saveRef = doc(db, "posts", post.id, "saves", uid);
  const postRef = doc(db, "posts", post.id);
  if (currentlySaved) {
    await deleteDoc(saveRef);
    await deleteDoc(doc(db, "users", uid, "saved", post.id)).catch(() => {});
    await updateDoc(postRef, { saveCount: increment(-1) });
  } else {
    await setDoc(saveRef, { createdAt: serverTimestamp() });
    await setDoc(doc(db, "users", uid, "saved", post.id), { createdAt: serverTimestamp() });
    await updateDoc(postRef, { saveCount: increment(1) });
    bumpAffinity(post.authorId, SIGNAL.save).catch(() => {});
  }
}

export async function fetchSavedPosts() {
  // Saves live under each post, so read the ids the user owns via their own
  // mirror doc rather than a collection-group query.
  const q = query(collection(db, "users", me(), "saved"), limit(200));
  const ids = (await getDocs(q)).docs.map((d) => d.id);
  const posts = await Promise.all(
    ids.map(async (id) => {
      const snap = await getDoc(doc(db, "posts", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    })
  );
  return posts.filter(Boolean).sort(byNewest);
}

// Sending a post into a chat produces a real preview card, not a text line.
// A denormalised snapshot rides along so the bubble renders instantly without
// a second read, and still resolves to the live post when tapped.
export async function sendPostTo(post, chatId, note = "") {
  const uid = me();
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: uid,
    text: note,
    sharedPost: {
      id: post.id,
      kind: post.kind,
      authorName: post.authorName || "",
      authorDisplayName: post.authorDisplayName || post.authorName || "",
      title: post.title || "",
      text: (post.text || "").slice(0, 140),
      mediaUrl: post.mediaUrl || "",
      mediaType: post.mediaType || "",
    },
    reactions: {},
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: `Shared a ${post.kind === "short" ? "flick" : post.kind === "video" ? "feature" : "post"}`,
    lastSenderId: uid,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "posts", post.id), { sendCount: increment(1) }).catch(() => {});
  bumpAffinity(post.authorId, SIGNAL.send).catch(() => {});
}

// Opening a shared post from a chat.
export async function fetchPost(postId) {
  const snap = await getDoc(doc(db, "posts", postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function openPost(postId) {
  window.dispatchEvent(new CustomEvent("mesh:open-post", { detail: postId }));
}

export function onOpenPost(handler) {
  const fn = (e) => handler(e.detail);
  window.addEventListener("mesh:open-post", fn);
  return () => window.removeEventListener("mesh:open-post", fn);
}

// ---------- negative signals ----------
// Explicit negatives are as valuable to the ranker as positives, and they are
// the only honest way to give someone control over what they're shown.

export async function hidePost(post, reason = "not_interested") {
  await setDoc(doc(db, "users", me(), "hidden", post.id), {
    authorId: post.authorId,
    reason,
    createdAt: serverTimestamp(),
  });
  // A hide is a strong negative against that author.
  bumpAffinity(post.authorId, SIGNAL.hide).catch(() => {});
}

export async function fetchHiddenPostIds() {
  const q = query(collection(db, "users", me(), "hidden"), limit(500));
  const set = new Set();
  (await getDocs(q)).docs.forEach((d) => set.add(d.id));
  return set;
}

export async function reportPost(post, reason) {
  await addDoc(collection(db, "reports"), {
    reporterId: me(),
    postId: post.id,
    authorId: post.authorId,
    reason,
    status: "open",
    createdAt: serverTimestamp(),
  });
  await hidePost(post, "reported").catch(() => {});
}

export const REPORT_REASONS = [
  { id: "hate", label: "Hate speech or harassment" },
  { id: "spam", label: "Spam or scam" },
  { id: "violence", label: "Violence or dangerous content" },
  { id: "sexual", label: "Sexual content" },
  { id: "misinfo", label: "False information" },
  { id: "other", label: "Something else" },
];

// ---------- comments ----------

export async function fetchComments(postId) {
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(200));
  return snapToList(await getDocs(q));
}

export async function addComment(post, text) {
  const user = auth.currentUser;
  const profile = await fetchProfile(user.uid);
  const comment = {
    authorId: user.uid,
    authorName: profile?.username || "unknown",
    text,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "posts", post.id, "comments"), comment);
  await updateDoc(doc(db, "posts", post.id), { commentCount: increment(1) });
  bumpAffinity(post.authorId, SIGNAL.comment).catch(() => {});
  return comment;
}

// ---------- follows ----------

export async function fetchMyFollowingSet() {
  const q = query(collection(db, "users", me(), "following"), limit(500));
  const set = new Set();
  (await getDocs(q)).docs.forEach((d) => set.add(d.id));
  return set;
}

export async function isFollowing(targetUid) {
  const snap = await getDoc(doc(db, "users", me(), "following", targetUid));
  return snap.exists();
}

export async function toggleFollow(target, currentlyFollowing) {
  const uid = me();
  const myProfile = await fetchProfile(uid);
  const followingRef = doc(db, "users", uid, "following", target.id);
  const followerRef = doc(db, "users", target.id, "followers", uid);
  if (currentlyFollowing) {
    await deleteDoc(followingRef);
    await deleteDoc(followerRef);
    await updateDoc(doc(db, "users", uid), { followingCount: increment(-1) });
    await updateDoc(doc(db, "users", target.id), { followerCount: increment(-1) });
  } else {
    await setDoc(followingRef, { username: target.username || "", createdAt: serverTimestamp() });
    await setDoc(followerRef, { username: myProfile?.username || "", createdAt: serverTimestamp() });
    await updateDoc(doc(db, "users", uid), { followingCount: increment(1) });
    await updateDoc(doc(db, "users", target.id), { followerCount: increment(1) });
    bumpAffinity(target.id, SIGNAL.follow).catch(() => {});
  }
}

export async function fetchFollowList(uid, kind /* 'followers' | 'following' */) {
  const q = query(collection(db, "users", uid, kind), limit(200));
  return snapToList(await getDocs(q));
}

// ---------- search ----------

export async function searchUsers(term) {
  const t = term.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!t) return [];
  const q = query(
    collection(db, "usernames"),
    orderBy(documentId()),
    startAt(t),
    endAt(t + ""),
    limit(10)
  );
  const names = (await getDocs(q)).docs.map((d) => ({ username: d.id, uid: d.data().uid }));
  const profiles = await Promise.all(names.map((n) => fetchProfile(n.uid)));
  return profiles.filter(Boolean);
}

// ---------- stories (24h) ----------

export async function createStory({ mediaUrl, mediaPath, mediaType }) {
  const profile = await fetchProfile(me());
  const story = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "unknown",
    authorPhoto: profile?.photoURL || "",
    mediaUrl,
    mediaPath,
    mediaType,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "stories"), story);
}

export async function fetchActiveStories() {
  const cutoff = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);
  const q = query(collection(db, "stories"), where("createdAt", ">", cutoff), limit(200));
  const list = snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  // group by author
  const byAuthor = new Map();
  for (const s of list) {
    if (!byAuthor.has(s.authorId)) byAuthor.set(s.authorId, { authorId: s.authorId, authorName: s.authorName, authorPhoto: s.authorPhoto, items: [] });
    byAuthor.get(s.authorId).items.push(s);
  }
  return [...byAuthor.values()];
}

// ---------- news (fact-checked) ----------

export async function submitNews({ title, script, sources }) {
  const profile = await fetchProfile(me());
  const item = {
    authorId: me(),
    authorName: profile?.username || "unknown",
    title,
    script,
    sources, // array of URLs
    status: "pending",
    reviewNote: "",
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "news"), item);
  return { id: refDoc.id, ...item, createdAt: Timestamp.now() };
}

export async function fetchNews(status = "approved") {
  const q = query(collection(db, "news"), where("status", "==", status), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function fetchMyNews() {
  const q = query(collection(db, "news"), where("authorId", "==", me()), limit(50));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function isAdmin() {
  const snap = await getDoc(doc(db, "admins", me()));
  return snap.exists();
}

export async function reviewNews(id, status, reviewNote = "") {
  await updateDoc(doc(db, "news", id), { status, reviewNote });
}

// ---------- messaging ----------

export const CHAT_THEMES = {
  default: { label: "Default", bubble: "from-violet-600 to-fuchsia-600", accent: "violet" },
  ocean:   { label: "Ocean",   bubble: "from-sky-600 to-cyan-500",       accent: "sky" },
  sunset:  { label: "Sunset",  bubble: "from-orange-500 to-rose-500",    accent: "orange" },
  forest:  { label: "Forest",  bubble: "from-emerald-600 to-teal-500",   accent: "emerald" },
  mono:    { label: "Mono",    bubble: "from-zinc-600 to-zinc-500",      accent: "zinc" },
};

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

function chatDoc(chatId) {
  return doc(db, "chats", chatId);
}

export async function openDirectChat(target) {
  const uid = me();
  const chatId = [uid, target.id].sort().join("_");
  const ref = chatDoc(chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const myProfile = await fetchProfile(uid);
    await setDoc(ref, {
      members: [uid, target.id].sort(),
      memberNames: { [uid]: myProfile?.username || "?", [target.id]: target.username || "?" },
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
  }
  return chatId;
}

export async function createGroupChat(name, targets) {
  const uid = me();
  const myProfile = await fetchProfile(uid);
  const memberNames = { [uid]: myProfile?.username || "?" };
  targets.forEach((t) => (memberNames[t.id] = t.username || "?"));
  const refDoc = await addDoc(collection(db, "chats"), {
    members: [uid, ...targets.map((t) => t.id)],
    memberNames,
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
  });
  return refDoc.id;
}

export function listenChats(callback) {
  const q = query(collection(db, "chats"), where("members", "array-contains", me()), limit(100));
  return onSnapshot(q, (snap) => {
    const uid = me();
    const chats = snapToList(snap).sort((a, b) => {
      // Pinned chats float, then most recent.
      const ap = (a.pinnedBy || []).includes(uid) ? 1 : 0;
      const bp = (b.pinnedBy || []).includes(uid) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return tsMillis(b.updatedAt) - tsMillis(a.updatedAt);
    });
    callback(chats);
  });
}

export function listenMessages(chatId, callback) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"), limit(300));
  return onSnapshot(q, (snap) => callback(snapToList(snap)));
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
    lastMessage: (extras.poll ? "📊 " + extras.poll.question : text).slice(0, 80),
    lastSenderId: uid,
    updatedAt: serverTimestamp(),
  });
  await clearTyping(chatId).catch(() => {});
}

// --- edit & unsend ---

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

// Unsend keeps a tombstone so the thread doesn't silently reshuffle.
export async function unsendMessage(chatId, msg) {
  await updateDoc(doc(db, "chats", chatId, "messages", msg.id), {
    text: "",
    deleted: true,
    sharedPost: deleteField(),
  });
}

// --- reactions ---
// Stored as { uid: emoji } so a rule can verify you only ever touch your own key.

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

// --- typing & presence ---

let lastTypingWrite = 0;

export async function setTyping(chatId) {
  // Throttled: a write per keystroke would hammer the document.
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

// --- read receipts & unread ---

export async function markRead(chatId) {
  await setDoc(doc(db, "chats", chatId, "reads", me()), { at: serverTimestamp() }, { merge: true });
}

export async function markUnread(chatId) {
  // Rewind the read marker so the chat shows as unread again.
  await setDoc(doc(db, "chats", chatId, "reads", me()), { at: Timestamp.fromMillis(0) });
}

export function listenReads(chatId, callback) {
  return onSnapshot(collection(db, "chats", chatId, "reads"), (snap) => {
    const map = new Map();
    snap.docs.forEach((d) => map.set(d.id, tsMillis(d.data().at)));
    callback(map);
  });
}

export async function fetchMyReadTimes(chatIds) {
  const uid = me();
  const map = new Map();
  await Promise.all(
    chatIds.map(async (id) => {
      const snap = await getDoc(doc(db, "chats", id, "reads", uid));
      map.set(id, snap.exists() ? tsMillis(snap.data().at) : 0);
    })
  );
  return map;
}

// --- inbox organisation ---

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

// A chat is a "request" when someone you don't follow started it.
export function isRequest(chat, followingSet) {
  const uid = me();
  return chat.createdBy !== uid && !followingSet.has(chat.createdBy);
}

// --- polls ---

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

// --- thoughts (60-char, 24h, pinned above the inbox) ---

export async function setThought(text) {
  const profile = await fetchProfile(me());
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

// ---------- spouse invites ----------

export async function sendSpouseRequest(targetProfile) {
  const uid = me();
  const myProfile = await fetchProfile(uid);
  await addDoc(collection(db, "spouseRequests"), {
    fromUid: uid,
    fromUsername: myProfile?.username || "?",
    toUid: targetProfile.id,
    toUsername: targetProfile.username,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", uid), { spouseUsername: `${targetProfile.username} (pending)` });
}

export async function fetchIncomingSpouseRequests() {
  const q = query(collection(db, "spouseRequests"), where("toUid", "==", me()), limit(10));
  return snapToList(await getDocs(q)).filter((r) => r.status === "pending");
}

export async function respondSpouseRequest(request, accept) {
  await updateDoc(doc(db, "spouseRequests", request.id), { status: accept ? "accepted" : "declined" });
  if (accept) {
    await updateDoc(doc(db, "users", me()), { spouseUsername: request.fromUsername });
  }
}

export async function fetchMySpouseRequestStatus() {
  const q = query(collection(db, "spouseRequests"), where("fromUid", "==", me()), limit(10));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))[0] || null;
}

// ---------- circles (communities) ----------
// privacy: 'public'  — anyone can find it and read posts
//          'private' — anyone can find it, only members read posts
//          'hidden'  — invite link only, never listed

export const CIRCLE_PRIVACY = [
  { id: "public", label: "Public", blurb: "Anyone can find it and read posts." },
  { id: "private", label: "Private", blurb: "Anyone can find it; only members see posts." },
  { id: "hidden", label: "Hidden", blurb: "Invite link only. Never shown in search." },
];

export const ROLES = { owner: "Admin", moderator: "Moderator", member: "Member" };

export const COVER_COLORS = [
  "from-violet-600 via-fuchsia-600 to-rose-500",
  "from-sky-600 via-cyan-500 to-emerald-500",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-emerald-600 via-teal-500 to-sky-500",
  "from-indigo-600 via-purple-600 to-pink-500",
];

export async function fetchGroups() {
  // Hidden circles are excluded server-side by the list rule.
  const q = query(collection(db, "groups"), where("privacy", "in", ["public", "private"]), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function fetchGroupById(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchMyGroups() {
  const mineIds = snapToList(await getDocs(query(collection(db, "groups"), where("ownerId", "==", me()), limit(50))));
  return mineIds.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function createGroup({ name, description, privacy = "public" }) {
  const uid = me();
  const group = {
    name,
    description,
    privacy,
    ownerId: uid,
    memberCount: 1,
    requireApproval: privacy !== "public",
    rules: "",
    coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
    pinnedPostId: "",
    screeningQuestions: [],
    automod: AUTOMOD_DEFAULTS,
    createdAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "groups"), group);
  await setDoc(doc(db, "groups", refDoc.id, "members", uid), {
    uid,
    role: "owner",
    joinedAt: serverTimestamp(),
  });
  return { id: refDoc.id, ...group, createdAt: Timestamp.now() };
}

// --- circle governance ---
// Rules, entry screening, automated moderation and graduated penalties. A
// community without these devolves fast, so they ship with the feature rather
// than after it.

export const AUTOMOD_DEFAULTS = {
  blockLinks: false,
  blockNewAccounts: false,   // accounts younger than 7 days
  requirePostApproval: false,
  bannedWords: [],
};

export async function updateCircle(groupId, fields) {
  await updateDoc(doc(db, "groups", groupId), fields);
}

export async function setCircleRules(groupId, rules) {
  await updateDoc(doc(db, "groups", groupId), { rules });
}

export async function setScreeningQuestions(groupId, questions) {
  await updateDoc(doc(db, "groups", groupId), { screeningQuestions: questions.slice(0, 3) });
}

export async function setAutomod(groupId, automod) {
  await updateDoc(doc(db, "groups", groupId), { automod });
}

// Runs before a post is written. Returns an error string, or null to allow.
export function screenPost(text, group, profile) {
  const automod = { ...AUTOMOD_DEFAULTS, ...(group?.automod || {}) };
  const body = String(text || "").toLowerCase();

  if (automod.blockLinks && /https?:\/\/|www\./i.test(body)) {
    return "This circle doesn't allow links in posts.";
  }
  const hit = (automod.bannedWords || []).find((w) => w && body.includes(w.toLowerCase()));
  if (hit) return `This circle blocks the word "${hit}".`;

  if (automod.blockNewAccounts) {
    const age = Date.now() - tsMillis(profile?.createdAt);
    if (age > 0 && age < 7 * 86400000) {
      return "This circle only accepts posts from accounts older than 7 days.";
    }
  }
  return null;
}

// --- join requests (screening questions + rule agreement) ---

export async function requestToJoin(groupId, answers) {
  const uid = me();
  const profile = await fetchProfile(uid);
  await setDoc(doc(db, "groups", groupId, "joinRequests", uid), {
    uid,
    username: profile?.username || "",
    answers,
    agreedToRules: true,
    createdAt: serverTimestamp(),
  });
}

export async function fetchJoinRequests(groupId) {
  const q = query(collection(db, "groups", groupId, "joinRequests"), limit(100));
  return snapToList(await getDocs(q));
}

export async function approveJoinRequest(groupId, request) {
  await setDoc(doc(db, "groups", groupId, "members", request.uid), {
    uid: request.uid,
    username: request.username || "",
    role: "member",
    joinedAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, "groups", groupId, "joinRequests", request.uid));
  await updateDoc(doc(db, "groups", groupId), { memberCount: increment(1) });
}

export async function declineJoinRequest(groupId, uid) {
  await deleteDoc(doc(db, "groups", groupId, "joinRequests", uid));
}

export async function myJoinRequest(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId, "joinRequests", me()));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// --- pinned posts, thread locking, member penalties ---

export async function setPinnedPost(groupId, postId) {
  await updateDoc(doc(db, "groups", groupId), { pinnedPostId: postId || "" });
}

export async function setPostLocked(postId, locked) {
  await updateDoc(doc(db, "posts", postId), { locked });
}

// Graduated penalties: a timed mute, then post-approval, then removal.
export async function penaliseMember(groupId, uid, penalty) {
  const until = penalty === "mute12h" ? Timestamp.fromMillis(Date.now() + 12 * 3600 * 1000) : null;
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    penalty: penalty || "",
    mutedUntil: until,
  });
}

export function isMuted(membership) {
  const until = tsMillis(membership?.mutedUntil);
  return until > Date.now();
}

// --- contributor badges ---
// Earned from real activity in the circle rather than handed out.

export function contributorBadge(member, postCount) {
  if (member?.role === "owner") return { label: "Admin", tone: "violet" };
  if (member?.role === "moderator") return { label: "Mod", tone: "sky" };
  if (postCount >= 20) return { label: "Top contributor", tone: "amber" };
  if (postCount >= 5) return { label: "Regular", tone: "emerald" };
  const joined = tsMillis(member?.joinedAt);
  if (joined && Date.now() - joined < 7 * 86400000) return { label: "New here", tone: "zinc" };
  return null;
}

export async function countPostsByAuthorInGroup(groupId, uid) {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("groupId", "==", groupId),
    limit(100)
  );
  return snapToList(await getDocs(q)).filter((p) => p.authorId === uid).length;
}

export async function fetchMembership(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId, "members", me()));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchMembers(groupId) {
  const q = query(collection(db, "groups", groupId, "members"), limit(200));
  return snapToList(await getDocs(q));
}

export async function joinGroup(groupId) {
  const uid = me();
  await setDoc(doc(db, "groups", groupId, "members", uid), {
    uid,
    role: "member",
    joinedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), { memberCount: increment(1) });
}

export async function leaveGroup(groupId) {
  await deleteDoc(doc(db, "groups", groupId, "members", me()));
  await updateDoc(doc(db, "groups", groupId), { memberCount: increment(-1) });
}

// Admins promote and demote; only the owner can hand out moderator status.
export async function setMemberRole(groupId, uid, role) {
  await updateDoc(doc(db, "groups", groupId, "members", uid), { role });
}

export async function removeMember(groupId, uid) {
  await deleteDoc(doc(db, "groups", groupId, "members", uid));
  await updateDoc(doc(db, "groups", groupId), { memberCount: increment(-1) });
}

export function canModerate(membership, group) {
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "moderator" || group?.ownerId === me();
}

// ---------- gatherings (events, scoped to a circle or standalone) ----------
// Public gatherings take Going / Interested; private ones take Going / Maybe /
// Can't go so a host can count heads exactly.

export const RSVP_OPTIONS = {
  public: [
    { id: "going", label: "Going" },
    { id: "interested", label: "Interested" },
  ],
  private: [
    { id: "going", label: "Going" },
    { id: "maybe", label: "Maybe" },
    { id: "cant", label: "Can't go" },
  ],
};

export async function fetchEvents(groupId = "") {
  const q = groupId
    ? query(collection(db, "events"), where("groupId", "==", groupId), limit(100))
    : query(collection(db, "events"), where("privacy", "==", "public"), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

export async function createEvent({ title, description, location, startsAt, privacy = "public", groupId = "", ticketUrl = "", showGuestList = true }) {
  const user = auth.currentUser;
  const profile = await fetchProfile(user.uid);
  const event = {
    title,
    description,
    location,
    startsAt,
    privacy,
    groupId,
    ticketUrl,
    showGuestList,
    hostId: user.uid,
    hostName: profile?.username || "unknown",
    goingCount: 1,
    interestedCount: 0,
    createdAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "events"), event);
  await setDoc(doc(db, "events", refDoc.id, "rsvps", user.uid), {
    status: "going",
    username: profile?.username || "",
    createdAt: serverTimestamp(),
  });
  return { id: refDoc.id, ...event, createdAt: Timestamp.now() };
}

export async function fetchMyRsvps(eventIds) {
  const uid = me();
  const map = new Map();
  await Promise.all(
    eventIds.map(async (id) => {
      const snap = await getDoc(doc(db, "events", id, "rsvps", uid));
      if (snap.exists()) map.set(id, snap.data().status);
    })
  );
  return map;
}

export async function fetchGuestList(eventId) {
  const q = query(collection(db, "events", eventId, "rsvps"), limit(200));
  return snapToList(await getDocs(q));
}

// Counters move by ±1 per write, so switching status is two separate updates.
export async function setRsvp(event, previous, next) {
  const uid = me();
  const profile = await fetchProfile(uid);
  const rsvpRef = doc(db, "events", event.id, "rsvps", uid);
  const eventRef = doc(db, "events", event.id);
  const counterFor = (s) => (s === "going" ? "goingCount" : s === "interested" ? "interestedCount" : null);

  if (previous === next) {
    await deleteDoc(rsvpRef);
    const field = counterFor(previous);
    if (field) await updateDoc(eventRef, { [field]: increment(-1) });
    return null;
  }
  if (previous) {
    const field = counterFor(previous);
    if (field) await updateDoc(eventRef, { [field]: increment(-1) });
  }
  await setDoc(rsvpRef, { status: next, username: profile?.username || "", createdAt: serverTimestamp() });
  const nextField = counterFor(next);
  if (nextField) await updateDoc(eventRef, { [nextField]: increment(1) });
  return next;
}

// Host announcements live in the gathering's own discussion thread.
export async function fetchAnnouncements(eventId) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "asc"), limit(100));
  return snapToList(await getDocs(q));
}

export async function postAnnouncement(eventId, text) {
  const profile = await fetchProfile(me());
  const item = { authorId: me(), authorName: profile?.username || "", text, createdAt: serverTimestamp() };
  await addDoc(collection(db, "events", eventId, "announcements"), item);
  return item;
}

// ---------- account: data export & deletion (GDPR/CCPA style) ----------

export async function exportMyData() {
  const uid = me();
  const [profile, posts, groups, events, following, followers] = await Promise.all([
    fetchProfile(uid),
    fetchPostsByAuthor(uid),
    fetchGroups().then((gs) => gs.filter((g) => g.ownerId === uid)),
    fetchEvents().then((es) => es.filter((e) => e.hostId === uid)),
    fetchFollowList(uid, "following"),
    fetchFollowList(uid, "followers"),
  ]);
  const comments = [];
  for (const p of posts) {
    const cs = await fetchComments(p.id).catch(() => []);
    comments.push(...cs.filter((c) => c.authorId === uid).map((c) => ({ postId: p.id, ...c })));
  }
  return {
    exportedAt: new Date().toISOString(),
    account: { uid, email: auth.currentUser?.email || "", phone: auth.currentUser?.phoneNumber || "" },
    profile,
    posts,
    comments,
    groupsOwned: groups,
    eventsHosted: events,
    following,
    followers,
  };
}

// Best-effort content wipe before the auth user is deleted. Anything the rules
// refuse to delete is left in place rather than failing the whole operation.
export async function deleteMyAccountData() {
  const uid = me();
  const profile = await fetchProfile(uid).catch(() => null);
  const posts = await fetchPostsByAuthor(uid).catch(() => []);
  for (const p of posts) {
    await deletePost(p).catch(() => {});
  }
  if (profile?.username) {
    await deleteDoc(doc(db, "usernames", profile.username)).catch(() => {});
  }
}

// ---------- tiny app-wide navigation bus ----------

export function openUserProfile(uid) {
  window.dispatchEvent(new CustomEvent("mesh:open-user", { detail: uid }));
}

export function onOpenUserProfile(handler) {
  const fn = (e) => handler(e.detail);
  window.addEventListener("mesh:open-user", fn);
  return () => window.removeEventListener("mesh:open-user", fn);
}
