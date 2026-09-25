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
import { navigate } from "./router";

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

/* Bump this when the terms or privacy policy change materially. Existing
   accounts keep the version they accepted, which is what lets you tell who
   still needs to see a change notice. */
export const POLICY_VERSION = "2026-09-24";

export async function claimUsernameAndCreateProfile(user, username, birthYear, displayName) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid: user.uid });
  batch.set(doc(db, "users", user.uid), {
    username,
    name: displayName || username,
    usernameChangedAt: null,
    // Email and phone deliberately are NOT stored here. Every signed-in user
    // can read every user document, so anything written here is effectively
    // public. Firebase Auth already holds both, and only the account owner can
    // read their own auth record, which is the whole point.
    bio: "",
    pronouns: "",
    town: "",
    spouseUsername: "",
    birthYear: birthYear || 0,
    photoURL: user.photoURL || "",
    followerCount: 0,
    followingCount: 0,
    createdAt: serverTimestamp(),
    // Proof of consent, written server-side so it can't be backdated.
    termsAcceptedAt: serverTimestamp(),
    termsVersion: POLICY_VERSION,
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
// happens on the free Spark plan: Cloud Storage requires the Blaze plan.
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Media uploads aren't enabled yet. Cloud Storage needs the Firebase Blaze plan. " +
        "Strands work fine in the meantime."
    );
    this.name = "StorageUnavailableError";
  }
}

// Probed once per session so the composer can tell the user *why* posting is
// blocked instead of failing at the end of a form.
let storageOk = null;

export async function storageAvailable() {
  if (storageOk !== null) return storageOk;
  // A missing bucket can leave the SDK retrying instead of erroring, so the
  // probe races a timeout; an unanswered bucket is treated as unavailable.
  const probe = (async () => {
    try {
      await getDownloadURL(ref(storage, `uploads/${me()}/.probe`));
      return true;
    } catch (err) {
      // "object not found" means the bucket exists and answered: that's a pass.
      return err?.code === "storage/object-not-found";
    }
  })();
  storageOk = await Promise.race([
    probe,
    new Promise((res) => setTimeout(() => res(false), 6000)),
  ]);
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

/* Four formats, one feed:
     post:  a Still: a photo with a caption
     text:  a Strand: words on their own, up to 500 characters
     short: a Flick: vertical video, three minutes or less
     video: a long Flick. It appears in the Flicks feed as a trailer cut from
             the full video (trailerStart, TRAILER_SECONDS long) and opens into
             the full-length player. */
export const KINDS = {
  post: { label: "Still", plural: "Stills" },
  text: { label: "Strand", plural: "Strands" },
  short: { label: "Flick", plural: "Flicks" },
  video: { label: "Flick", plural: "Flicks", long: true },
};
export const STRAND_MAX = 500;
export const LONG_VIDEO_SECONDS = 180;
export const TRAILER_SECONDS = 30;

export function kindLabel(post) {
  return KINDS[post?.kind]?.label || "Post";
}

export async function createPost({
  kind, text, title, alt, mediaUrl, mediaPath, mediaType, groupId, visibility,
  duration = 0, trailerStart = 0, aiGenerated = false,
}) {
  const user = auth.currentUser;
  const profile = await fetchProfile(user.uid);
  const post = {
    kind, // 'post' | 'text' | 'short' | 'video'
    authorId: user.uid,
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "unknown",
    authorPhoto: profile?.photoURL || "",
    text: text || "",
    title: title || "",
    alt: alt || "", // author-written description of the media, for screen readers
    mediaUrl: mediaUrl || "",
    mediaPath: mediaPath || "",
    mediaType: mediaType || "",
    groupId: groupId || "",
    visibility: visibility || "public",
    duration: Math.round(duration) || 0, // seconds, video only
    trailerStart: Math.max(0, Math.round(trailerStart) || 0),
    // The author's own label for AI-made or AI-altered media. Shown on the
    // post. The Terms require it wherever media could pass for real.
    aiGenerated: !!aiGenerated,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    sendCount: 0,
    repostCount: 0,
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

/** Short and long Flicks together. Long ones play as their trailer. */
export async function fetchVideos() {
  const [shorts, longs] = await Promise.all([
    fetchPostsByKind("short"),
    fetchPostsByKind("video").catch(() => []),
  ]);
  return [...shorts, ...longs].sort(byNewest);
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

/* A circle's posts. Public circles post publicly; private and hidden ones
   post with visibility "circle", which the rules only let members read.
   Posts made before a circle went private are still "public", so members
   of a private circle get both. */
export async function fetchGroupPosts(group, { member = false } = {}) {
  const byVis = (vis) => getDocs(query(
    collection(db, "posts"),
    where("visibility", "==", vis),
    where("groupId", "==", group.id),
    limit(100)
  )).then(snapToList);
  if (group.privacy === "public") return (await byVis("public")).sort(byNewest);
  if (!member) return [];
  const [circle, legacy] = await Promise.all([byVis("circle"), byVis("public").catch(() => [])]);
  return [...circle, ...legacy].sort(byNewest);
}

/** Posts waiting for approval: all of them for admins, your own for you. */
export async function fetchPendingPosts(groupId, { mine = false } = {}) {
  const q = mine
    ? query(collection(db, "posts"), where("authorId", "==", me()), where("groupId", "==", groupId), where("visibility", "==", "pending"), limit(50))
    : query(collection(db, "posts"), where("visibility", "==", "pending"), where("groupId", "==", groupId), limit(100));
  return snapToList(await getDocs(q)).sort(byNewest);
}

export async function approvePost(post, group) {
  await updateDoc(doc(db, "posts", post.id), { visibility: circleVisibility(group) });
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
//   TikTok:  passive watch signals (completion, replay) map interest fast
//   Instagram: a "send" to a friend is the strongest taste signal there is
//   Facebook: comments and replies mean meaningful social interaction
//   YouTube: a click that turns into sustained watch time beats a bare click
export const SIGNAL = {
  hide: -8,        // explicit "not interested", the strongest negative
  skip: -1,        // scrolled away almost immediately
  view: 0.25,      // watched a meaningful chunk
  complete: 1,     // watched to the end
  replay: 1.5,     // watched again, strong intent
  like: 1,
  comment: 2,      // MSI: conversation beats a tap
  save: 3,
  send: 4,         // the Instagram "sends" economy
  repost: 3.5,     // a public endorsement: costs reputation, not just a tap
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
    lastMessage: `Shared a ${kindLabel(post).toLowerCase()}`,
    lastSenderId: uid,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "posts", post.id), { sendCount: increment(1) }).catch(() => {});
  bumpAffinity(post.authorId, SIGNAL.send).catch(() => {});
}

// ---------- reposts ----------
// A repost puts someone else's public post in front of your followers with
// your name on it. One doc per (post, person), keyed so it can't be doubled.
// Followers-only posts can't be reposted: the rules refuse it, since that
// would leak them past the audience their author chose.

const repostId = (postId, uid) => `${postId}_${uid}`;

export async function fetchMyReposts(postIds) {
  const uid = me();
  const out = new Set();
  await Promise.all(
    postIds.map(async (id) => {
      const snap = await getDoc(doc(db, "reposts", repostId(id, uid))).catch(() => null);
      if (snap?.exists()) out.add(id);
    })
  );
  return out;
}

export async function toggleRepost(post, currentlyReposted) {
  const uid = me();
  const ref_ = doc(db, "reposts", repostId(post.id, uid));
  const postRef = doc(db, "posts", post.id);
  if (currentlyReposted) {
    await deleteDoc(ref_);
    await updateDoc(postRef, { repostCount: increment(-1) });
  } else {
    const profile = await fetchProfile(uid);
    await setDoc(ref_, {
      postId: post.id,
      postAuthorId: post.authorId,
      uid,
      username: profile?.username || "",
      createdAt: serverTimestamp(),
    });
    await updateDoc(postRef, { repostCount: increment(1) });
    bumpAffinity(post.authorId, SIGNAL.repost).catch(() => {});
  }
}

/** Recent reposts by a set of people, used to surface what the people you follow passed on. */
export async function fetchRepostsBy(uids, max = 60) {
  const list = [...uids];
  const out = [];
  for (let i = 0; i < list.length && i < 90; i += 30) {
    const snap = await getDocs(
      query(collection(db, "reposts"), where("uid", "in", list.slice(i, i + 30)), limit(max))
    ).catch(() => null);
    snap?.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
  }
  return out.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/** Posts someone has reposted, newest first. Posts that were deleted or made private drop out. */
export async function fetchRepostedPosts(uid) {
  const reposts = await fetchRepostsBy([uid], 50);
  const posts = await Promise.all(reposts.map((r) => fetchPost(r.postId).catch(() => null)));
  return posts
    .map((p, i) => (p ? { ...p, repostedAt: reposts[i].createdAt } : null))
    .filter(Boolean);
}

// Opening a shared post from a chat.
export async function fetchPost(postId) {
  const snap = await getDoc(doc(db, "posts", postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function openPost(postId) {
  navigate(`/p/${encodeURIComponent(postId)}`, { overlay: true });
}

/** A long Flick opens in the full-length player; everything else opens as a post. */
export function openWatch(postId) {
  navigate(`/watch/${encodeURIComponent(postId)}`, { overlay: true });
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
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text,
    createdAt: serverTimestamp(),
  };
  const ref_ = await addDoc(collection(db, "posts", post.id, "comments"), comment);
  await updateDoc(doc(db, "posts", post.id), { commentCount: increment(1) });
  bumpAffinity(post.authorId, SIGNAL.comment).catch(() => {});
  return { id: ref_.id, ...comment, createdAt: Timestamp.now() };
}

/** Your own comment, or any comment on your own post. */
export async function deleteComment(post, commentId) {
  await deleteDoc(doc(db, "posts", post.id, "comments", commentId));
  await updateDoc(doc(db, "posts", post.id), { commentCount: increment(-1) }).catch(() => {});
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

/* Follow or unfollow. A private (locked) account can't be followed
   directly: you send a request and they approve it. Returns what happened:
   "following", "requested" or "unfollowed". */
export async function toggleFollow(target, currentlyFollowing) {
  const uid = me();
  const followingRef = doc(db, "users", uid, "following", target.id);
  const followerRef = doc(db, "users", target.id, "followers", uid);
  if (currentlyFollowing) {
    await deleteDoc(followingRef);
    await deleteDoc(followerRef);
    await updateDoc(doc(db, "users", uid), { followingCount: increment(-1) });
    await updateDoc(doc(db, "users", target.id), { followerCount: increment(-1) });
    return "unfollowed";
  }
  const full = target.isPrivate === undefined ? await fetchProfile(target.id) : target;
  if (full?.isPrivate) {
    await requestFollow(target);
    return "requested";
  }
  const myProfile = await fetchProfile(uid);
  await setDoc(followingRef, { username: target.username || full?.username || "", createdAt: serverTimestamp() });
  await setDoc(followerRef, { username: myProfile?.username || "", createdAt: serverTimestamp() });
  await updateDoc(doc(db, "users", uid), { followingCount: increment(1) });
  await updateDoc(doc(db, "users", target.id), { followerCount: increment(1) });
  bumpAffinity(target.id, SIGNAL.follow).catch(() => {});
  return "following";
}

// --- follow requests (private accounts) ---

export async function requestFollow(target) {
  const profile = await fetchProfile(me());
  await setDoc(doc(db, "users", target.id, "followRequests", me()), {
    username: profile?.username || "",
    createdAt: serverTimestamp(),
  });
}

export async function cancelFollowRequest(targetId) {
  await deleteDoc(doc(db, "users", targetId, "followRequests", me()));
}

export async function hasRequestedFollow(targetId) {
  const snap = await getDoc(doc(db, "users", targetId, "followRequests", me())).catch(() => null);
  return !!snap?.exists();
}

export async function fetchFollowRequests() {
  const q = query(collection(db, "users", me(), "followRequests"), limit(200));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/* Approving writes both halves of the follow (the rules allow the approver
   to, while the request exists), then removes the request. */
export async function approveFollowRequest(request) {
  const uid = me();
  const profile = await fetchProfile(uid);
  await setDoc(doc(db, "users", uid, "followers", request.id), { username: request.username || "", createdAt: serverTimestamp() });
  await setDoc(doc(db, "users", request.id, "following", uid), { username: profile?.username || "", createdAt: serverTimestamp() });
  await updateDoc(doc(db, "users", uid), { followerCount: increment(1) }).catch(() => {});
  await updateDoc(doc(db, "users", request.id), { followingCount: increment(1) }).catch(() => {});
  await deleteDoc(doc(db, "users", uid, "followRequests", request.id));
}

export async function declineFollowRequest(request) {
  await deleteDoc(doc(db, "users", me(), "followRequests", request.id));
}

// --- blocking ---
// Blocking someone ends any follow in either direction and stops them
// following, requesting, messaging you or commenting on your posts (all
// enforced in the rules). Their posts disappear from what you see.

export async function blockUser(target) {
  const uid = me();
  await setDoc(doc(db, "users", uid, "blocked", target.id), { username: target.username || "", createdAt: serverTimestamp() });
  const [iFollow, theyFollow] = await Promise.all([
    getDoc(doc(db, "users", uid, "following", target.id)).then((d) => d.exists()).catch(() => false),
    getDoc(doc(db, "users", uid, "followers", target.id)).then((d) => d.exists()).catch(() => false),
  ]);
  if (iFollow) await toggleFollow(target, true).catch(() => {});
  if (theyFollow) {
    await deleteDoc(doc(db, "users", uid, "followers", target.id)).catch(() => {});
    await deleteDoc(doc(db, "users", target.id, "following", uid)).catch(() => {});
    await updateDoc(doc(db, "users", uid), { followerCount: increment(-1) }).catch(() => {});
    await updateDoc(doc(db, "users", target.id), { followingCount: increment(-1) }).catch(() => {});
  }
  await deleteDoc(doc(db, "users", uid, "followRequests", target.id)).catch(() => {});
}

export async function unblockUser(targetId) {
  await deleteDoc(doc(db, "users", me(), "blocked", targetId));
}

export async function fetchBlocked() {
  const q = query(collection(db, "users", me(), "blocked"), limit(500));
  return snapToList(await getDocs(q));
}

// --- privacy settings ---

export async function setPrivacySettings(fields) {
  await updateDoc(doc(db, "users", me()), fields);
}

/* Going private: every public post you've made outside circles becomes
   followers-only. Going public again can reverse it, if you choose. */
export async function setPostsVisibility(to) {
  const from = to === "followers" ? "public" : "followers";
  const posts = (await fetchPostsByAuthor(me())).filter((p) => !p.groupId && p.visibility === from);
  let done = 0;
  for (const p of posts) {
    await updateDoc(doc(db, "posts", p.id), { visibility: to }).then(() => { done += 1; }).catch(() => {});
  }
  return { done, total: posts.length };
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

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/* A private account's stories are for its followers only. Each story
   carries its day so the last 24 hours can be fetched without a composite
   index. */
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
    audience: profile?.isPrivate ? "followers" : "public",
    day: dayKey(Date.now()),
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "stories"), story);
}

export async function fetchActiveStories(followingSet = new Set()) {
  const days = [dayKey(Date.now()), dayKey(Date.now() - 86400000)];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const run = (q) => getDocs(q).then(snapToList).catch(() => []);
  const followed = [...followingSet].slice(0, 30);
  const lists = await Promise.all([
    run(query(collection(db, "stories"), where("audience", "==", "public"), where("day", "in", days), limit(200))),
    run(query(collection(db, "stories"), where("authorId", "==", me()), where("day", "in", days), limit(50))),
    ...followed.map((uid) => run(query(collection(db, "stories"),
      where("authorId", "==", uid), where("audience", "==", "followers"), where("day", "in", days), limit(20)))),
  ]);
  const seen = new Set();
  const list = lists.flat()
    .filter((s) => !seen.has(s.id) && seen.add(s.id) && tsMillis(s.createdAt) > cutoff)
    .sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  const byAuthor = new Map();
  for (const s of list) {
    if (!byAuthor.has(s.authorId)) byAuthor.set(s.authorId, { authorId: s.authorId, authorName: s.authorName, authorPhoto: s.authorPhoto, items: [] });
    byAuthor.get(s.authorId).items.push(s);
  }
  return [...byAuthor.values()];
}

// ---------- news (reviewed against sources before publication) ----------

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
    // Only ever set by ticking the declaration in the submit form.
    attestedAt: serverTimestamp(),
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

// Every stop keeps white message text at 4.5:1 or better (WCAG AA). The
// earlier ocean, sunset and forest themes used 500-weight colours that fell
// to 2.4–3.8:1, so messages in them were hard to read.
export const CHAT_THEMES = {
  default: { label: "Default", bubble: "from-violet-600 to-fuchsia-600", swatch: "#7c3aed" }, // 5.7 / 4.7
  ocean:   { label: "Ocean",   bubble: "from-sky-700 to-cyan-700",       swatch: "#0369a1" }, // 5.9 / 5.4
  sunset:  { label: "Sunset",  bubble: "from-orange-700 to-rose-600",    swatch: "#c2410c" }, // 5.2 / 4.7
  forest:  { label: "Forest",  bubble: "from-emerald-700 to-teal-700",   swatch: "#047857" }, // 5.5 / 5.5
  mono:    { label: "Mono",    bubble: "from-zinc-700 to-zinc-600",      swatch: "#52525b" }, // 10.4 / 7.7
};

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

function chatDoc(chatId) {
  return doc(db, "chats", chatId);
}

/* Throws an Error with a readable message when the other person can't be
   messaged (they've blocked you, or only take messages from people they follow). */
export async function openDirectChat(target) {
  const uid = me();
  const chatId = [uid, target.id].sort().join("_");
  const ref = chatDoc(chatId);
  const snap = await getDoc(ref);
  if (snap.exists()) return chatId;
  const myProfile = await fetchProfile(uid);
  try {
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
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new Error(`You can't message @${target.username || "this person"}. They only take messages from people they follow.`);
    }
    throw err;
  }
  return chatId;
}

/* A group starts with just you as its admin; each person is then added
   one at a time, because the rules check every add (blocked? only takes
   messages from people they follow?). Returns the chat id and anyone who
   couldn't be added. */
export async function createGroupChat(name, targets) {
  const uid = me();
  const myProfile = await fetchProfile(uid);
  const refDoc = await addDoc(collection(db, "chats"), {
    members: [uid],
    admins: [uid],
    memberNames: { [uid]: myProfile?.username || "?" },
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

/* Leaving: if you're the only admin, the next person in the group becomes one. */
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
// privacy: 'public':  anyone can find it and read posts
//          'private': anyone can find it, only members read posts
//          'hidden':  invite link only, never listed

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

export async function createGroup({ name, description, privacy = "public", ageLimit = 0 }) {
  const uid = me();
  const profile = await fetchProfile(uid);
  const group = {
    name,
    description,
    privacy,
    ownerId: uid,
    memberCount: 1,
    requireApproval: privacy !== "public",
    ageLimit,
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
    username: profile?.username || "",
    role: "owner",
    joinedAt: serverTimestamp(),
  });
  return { id: refDoc.id, ...group, createdAt: Timestamp.now() };
}

// --- circle governance ---
// Rules, entry screening, automated moderation and graduated penalties. A
// community without these devolves fast, so they ship with the feature rather
// than after it.

/* Every limit here is enforced twice: in the app, so people get a clear
   reason before they try, and in firestore.rules, so the limit still holds
   against anyone who skips the app. Admins and moderators are exempt from
   the posting limits (not from blocked words). */
export const AUTOMOD_DEFAULTS = {
  postingPermission: "members", // "members" | "admins": who can start a post
  requirePostApproval: false,   // members' posts wait for an admin or moderator
  blockLinks: false,
  blockNewAccounts: false,      // accounts younger than 7 days can read but not post
  bannedWords: [],              // single words, stored lowercase
};

export const AGE_LIMITS = [
  { id: 0, label: "Everyone", blurb: "Anyone with a Mesh account can join." },
  { id: 16, label: "16 and over", blurb: "Members must be 16 or older." },
  { id: 18, label: "18 and over", blurb: "Members must be 18 or older." },
];

export function isCircleMod(membership) {
  return membership?.role === "owner" || membership?.role === "moderator";
}

/** Whether a profile meets a circle's (or gathering's) age limit. */
export function meetsAgeLimit(limitYears, profile) {
  if (!limitYears) return true;
  const y = profile?.birthYear || 0;
  return y > 0 && new Date().getFullYear() - y >= limitYears;
}

/** Can this person join without asking? Mirrors the members rule. */
export function canJoinDirectly(group) {
  return group.privacy === "public" && !group.requireApproval && !(group.screeningQuestions || []).length;
}

/** Private and hidden circles keep posts to members; public circles don't. */
export function circleVisibility(group) {
  return group.privacy === "public" ? "public" : "circle";
}

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
  await updateDoc(doc(db, "groups", groupId), { automod: normaliseAutomod(automod) });
}

function normaliseAutomod(a) {
  const words = (a.bannedWords || [])
    .map((w) => String(w).toLowerCase().trim())
    .filter(Boolean);
  return {
    postingPermission: a.postingPermission === "admins" ? "admins" : "members",
    requirePostApproval: !!a.requirePostApproval,
    blockLinks: !!a.blockLinks,
    blockNewAccounts: !!a.blockNewAccounts,
    bannedWords: [...new Set(words)].slice(0, 40),
  };
}

/** Join and membership limits, set together from the Manage dialog. */
export async function setCircleLimits(groupId, { requireApproval, ageLimit, automod }) {
  await updateDoc(doc(db, "groups", groupId), {
    requireApproval: !!requireApproval,
    ageLimit: [0, 16, 18].includes(ageLimit) ? ageLimit : 0,
    automod: normaliseAutomod(automod),
  });
}

// Runs before a post is written: the app-side mirror of the circle-post
// rules in firestore.rules. Returns an error string, or null to allow.
export function screenPost(text, group, profile, membership) {
  const automod = { ...AUTOMOD_DEFAULTS, ...(group?.automod || {}) };
  const body = String(text || "").toLowerCase();
  const mod = isCircleMod(membership);

  if (!membership) return "Join this circle to post in it.";
  if (isMuted(membership)) return "You're muted in this circle for now.";
  if (automod.postingPermission === "admins" && !mod) {
    return "Only admins and moderators can post in this circle.";
  }
  if (!mod && automod.blockLinks && /https?:\/\/|www\./i.test(body)) {
    return "This circle doesn't allow links in posts.";
  }
  const words = new Set(body.split(/[^a-z0-9]+/).filter(Boolean));
  const hit = (automod.bannedWords || []).find((w) => w && (words.has(w.toLowerCase()) || body.includes(w.toLowerCase())));
  if (hit) return `This circle blocks the word "${hit}".`;

  if (!mod && automod.blockNewAccounts) {
    const age = Date.now() - tsMillis(profile?.createdAt);
    if (age >= 0 && age < 7 * 86400000) {
      return "This circle only takes posts from accounts older than 7 days.";
    }
  }
  return null;
}

/** Whether a new post goes straight up, or waits for an admin. */
export function circlePostVisibility(group, membership) {
  const automod = { ...AUTOMOD_DEFAULTS, ...(group?.automod || {}) };
  return automod.requirePostApproval && !isCircleMod(membership) ? "pending" : circleVisibility(group);
}

// --- join requests (screening questions + rule agreement) ---

export async function requestToJoin(groupId, answers) {
  // (Age limits are checked by the rules here too: under-age accounts can't
  // even ask.)
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

/** Post counts per member, from one read of the circle's posts. */
export async function countPostsByMember(group, member) {
  const posts = await fetchGroupPosts(group, { member }).catch(() => []);
  const counts = new Map();
  for (const p of posts) counts.set(p.authorId, (counts.get(p.authorId) || 0) + 1);
  return counts;
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
  const profile = await fetchProfile(uid);
  await setDoc(doc(db, "groups", groupId, "members", uid), {
    uid,
    username: profile?.username || "",
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

/* Who can see a gathering (mirrors canViewEvent in firestore.rules):
   public ones, anyone; private ones, the host, people they've invited, and
   members of the circle it belongs to. */
export function canViewEvent(event, membership) {
  if (!event) return false;
  return event.privacy === "public" || event.hostId === me()
    || (event.invitees || []).includes(me()) || (!!event.groupId && !!membership);
}

/** Who can post in a gathering's discussion: the host, and anyone who replied. */
export function canPostInEvent(event, myStatus) {
  if (event.hostId === me()) return true;
  return event.guestPosting !== "host" && !!myStatus;
}

export function isEventFull(event) {
  return (event.capacity || 0) > 0 && (event.goingCount || 0) >= event.capacity;
}

/** A circle's gatherings: all of them for members, only public ones otherwise. */
export async function fetchEvents(groupId = "", { member = false } = {}) {
  const q = groupId
    ? member
      ? query(collection(db, "events"), where("groupId", "==", groupId), limit(100))
      : query(collection(db, "events"), where("groupId", "==", groupId), where("privacy", "==", "public"), limit(100))
    : query(collection(db, "events"), where("privacy", "==", "public"), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

/** Private gatherings you've been invited to. */
export async function fetchInvitedEvents() {
  const q = query(collection(db, "events"), where("invitees", "array-contains", me()), limit(50));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

export async function fetchEvent(eventId) {
  const snap = await getDoc(doc(db, "events", eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEvent({
  title, description, location, startsAt, privacy = "public", groupId = "", ticketUrl = "",
  showGuestList = true, capacity = 0, guestPosting = "guests",
}) {
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
    capacity: Math.max(0, Math.floor(capacity) || 0), // 0 = no limit
    guestPosting: guestPosting === "host" ? "host" : "guests",
    invitees: [],
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

export async function updateEvent(eventId, fields) {
  await updateDoc(doc(db, "events", eventId), fields);
}

export async function deleteEvent(eventId) {
  await deleteDoc(doc(db, "events", eventId));
}

/** Invite people to a private gathering by adding them to its guest list. */
export async function inviteToEvent(eventId, users) {
  await updateDoc(doc(db, "events", eventId), { invitees: arrayUnion(...users.map((u) => u.id)) });
}

export async function uninviteFromEvent(eventId, uid) {
  await updateDoc(doc(db, "events", eventId), { invitees: arrayRemove(uid) });
}

export async function fetchMyRsvps(eventIds) {
  const uid = me();
  const map = new Map();
  await Promise.all(
    eventIds.map(async (id) => {
      const snap = await getDoc(doc(db, "events", id, "rsvps", uid)).catch(() => null);
      if (snap?.exists()) map.set(id, snap.data().status);
    })
  );
  return map;
}

export async function fetchGuestList(eventId) {
  const q = query(collection(db, "events", eventId, "rsvps"), limit(200));
  return snapToList(await getDocs(q));
}

/* One atomic write: the reply and the head-count change land together or
   not at all, so the count can't drift and a full gathering can't be
   overfilled (the rules check capacity against the count after the write). */
export async function setRsvp(event, previous, next) {
  const uid = me();
  const profile = await fetchProfile(uid);
  const rsvpRef = doc(db, "events", event.id, "rsvps", uid);
  const eventRef = doc(db, "events", event.id);
  const result = previous === next ? null : next;
  const delta = { goingCount: 0, interestedCount: 0 };
  const field = (s) => (s === "going" ? "goingCount" : s === "interested" ? "interestedCount" : null);
  if (field(previous)) delta[field(previous)] -= 1;
  if (field(result)) delta[field(result)] += 1;

  const batch = writeBatch(db);
  if (result) batch.set(rsvpRef, { status: result, username: profile?.username || "", createdAt: serverTimestamp() });
  else batch.delete(rsvpRef);
  const counters = {};
  if (delta.goingCount) counters.goingCount = increment(delta.goingCount);
  if (delta.interestedCount) counters.interestedCount = increment(delta.interestedCount);
  if (Object.keys(counters).length) batch.update(eventRef, counters);
  await batch.commit();
  return result;
}

// --- a gathering's discussion ---
// Guests (anyone who's replied) and the host post here; the host can switch
// it to host-only so it reads as announcements. Stored under the gathering,
// so a private gathering's discussion is exactly as private as the gathering.

export async function fetchEventPosts(eventId) {
  const q = query(collection(db, "events", eventId, "posts"), orderBy("createdAt", "desc"), limit(100));
  return snapToList(await getDocs(q));
}

export async function addEventPost(eventId, text) {
  const profile = await fetchProfile(me());
  const post = {
    authorId: me(),
    authorName: profile?.username || "",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text,
    likedBy: [],
    createdAt: serverTimestamp(),
  };
  const ref_ = await addDoc(collection(db, "events", eventId, "posts"), post);
  return { id: ref_.id, ...post, createdAt: Timestamp.now() };
}

export async function deleteEventPost(eventId, postId) {
  await deleteDoc(doc(db, "events", eventId, "posts", postId));
}

export async function toggleEventPostLike(eventId, post, liked) {
  await updateDoc(doc(db, "events", eventId, "posts", post.id), {
    likedBy: liked ? arrayRemove(me()) : arrayUnion(me()),
  });
}

// Announcements from before discussions existed. Read-only now; they show
// in the discussion as posts from the host.
export async function fetchAnnouncements(eventId) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "asc"), limit(100));
  return snapToList(await getDocs(q));
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
  const reposts = await fetchRepostsBy([uid], 500).catch(() => []);
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
    reposts: reposts.map(({ postId, createdAt }) => ({ postId, createdAt })),
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
  const reposts = await fetchRepostsBy([uid], 500).catch(() => []);
  for (const r of reposts) {
    await deleteDoc(doc(db, "reposts", r.id)).catch(() => {});
    await updateDoc(doc(db, "posts", r.postId), { repostCount: increment(-1) }).catch(() => {});
  }
  if (profile?.username) {
    await deleteDoc(doc(db, "usernames", profile.username)).catch(() => {});
  }
  // Private lists and signals, then who you follow (and your entry in their
  // followers), then the profile itself.
  const sub = async (name) => {
    const snap = await getDocs(query(collection(db, "users", uid, name), limit(500))).catch(() => null);
    return snap?.docs || [];
  };
  for (const name of ["affinity", "saved", "hidden", "blocked", "followRequests"]) {
    for (const d of await sub(name)) await deleteDoc(d.ref).catch(() => {});
  }
  for (const d of await sub("following")) {
    await deleteDoc(doc(db, "users", d.id, "followers", uid)).catch(() => {});
    await updateDoc(doc(db, "users", d.id), { followerCount: increment(-1) }).catch(() => {});
    await deleteDoc(d.ref).catch(() => {});
  }
  await deleteDoc(doc(db, "thoughts", uid)).catch(() => {});
  await deleteDoc(doc(db, "users", uid)).catch(() => {});
}

// ---------- tiny app-wide navigation bus ----------

export function openUserProfile(uid) {
  if (!uid) return;
  if (uid === me()) navigate("/account");
  else navigate(`/u/${encodeURIComponent(uid)}`, { overlay: true });
}
