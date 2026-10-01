// Posts and interactions on them: likes, saves, sends, reposts, hides, comments.
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db, loadStorage } from "../../firebase";
import { navigate } from "../router";
import { INLINE_PREFIX, isInline } from "../media";
import { circleVisibility } from "./circles.js";
import { me, snapToList, tsMillis } from "./core.js";
import { myProfile, uidForUsername } from "./users.js";
import { mentionedHandles, notify, unnotify } from "./notifications.js";

// post: photo (Still), text: up to 500 chars (Strand), short: video up to
// three minutes (Flick), video: longer Flick, shown in feeds as a
// TRAILER_SECONDS clip starting at trailerStart.
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

export const POLL_DURATIONS = [
  { id: 1, label: "1 hour", hours: 1 },
  { id: 24, label: "1 day", hours: 24 },
  { id: 72, label: "3 days", hours: 72 },
  { id: 168, label: "1 week", hours: 168 },
];

export const MAX_SLIDES = 10;

export async function createPost({
  kind, text, title, alt, mediaUrl, mediaPath, mediaType, groupId, visibility,
  duration = 0, trailerStart = 0, aiGenerated = false, topics = [], poll = null, gif = null, sensitive = false,
  circleTopic = "", media = null, location = "", posterUrl = "",
}) {
  const user = auth.currentUser;
  const profile = await myProfile();
  const post = {
    kind,
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
    duration: Math.round(duration) || 0, // seconds
    trailerStart: Math.max(0, Math.round(trailerStart) || 0),
    aiGenerated: !!aiGenerated,
    topics: topics.slice(0, 3),
    // Poll totals live on the post; individual votes are private (see votePoll).
    ...(poll ? {
      poll: { options: poll.options, endsAt: Timestamp.fromMillis(Date.now() + poll.hours * 3600e3) },
      pollVotes0: 0, pollVotes1: 0, pollVotes2: 0, pollVotes3: 0,
    } : {}),
    ...(gif ? { gif } : {}),
    // Flagged content (quoted abuse, borderline wording). The rules reject
    // blocklisted terms unless this is set, and clients render it collapsed.
    ...(sensitive ? { sensitive: true } : {}),
    // Carousel slides. media[0] duplicates mediaUrl/alt for single-image consumers.
    ...(kind === "post" && media?.length > 1 ? {
      media: media.slice(0, MAX_SLIDES).map((m) => ({ url: m.url, alt: (m.alt || "").slice(0, 500), w: Math.round(m.width || 0), h: Math.round(m.height || 0) })),
    } : {}),
    ...(location.trim() ? { location: location.trim().slice(0, 60) } : {}),
    // Video thumbnail (a frame captured when posting).
    ...(posterUrl ? { posterUrl } : {}),
    ...(groupId && circleTopic ? { circleTopic: circleTopic.slice(0, 40) } : {}),
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    sendCount: 0,
    repostCount: 0,
    viewCount: 0,
    completeCount: 0,
    createdAt: serverTimestamp(),
  };
  // The rules require the rate-limit stamp in the same batch (one post per 10s).
  const refDoc = doc(collection(db, "posts"));
  const batch = writeBatch(db);
  batch.set(refDoc, post);
  batch.set(doc(db, "rateLimits", user.uid), { post: serverTimestamp() }, { merge: true });
  // Circle slow mode reads the member's last post time.
  if (groupId) batch.update(doc(db, "groups", groupId, "members", user.uid), { lastPostAt: serverTimestamp() });
  await batch.commit();
  // Mentions notify only for public posts; others may not be readable by the recipient.
  if (post.visibility === "public") {
    mentionedHandles(post.text).forEach(async (handle) => {
      const uid = await uidForUsername(handle).catch(() => null);
      if (uid) notify(uid, "mention", { postId: refDoc.id, text: post.text.slice(0, 140) });
    });
  }
  return { id: refDoc.id, ...post, createdAt: Timestamp.now() };
}

// Post queries must let the `list` rule prove access statically: constrain
// visibility == "public" or authorId == me(), or the whole query is rejected.

const byNewest = (a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt);

export async function fetchFeed() {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("groupId", "==", ""),
    orderBy("createdAt", "desc"),
    limit(150)
  );
  return snapToList(await getDocs(q));
}

export async function fetchPostsByKind(kind) {
  const q = query(
    collection(db, "posts"),
    where("visibility", "==", "public"),
    where("kind", "==", kind),
    orderBy("createdAt", "desc"),
    limit(150)
  );
  return snapToList(await getDocs(q)).filter((p) => !p.groupId);
}

export async function fetchTopicPosts(topic) {
  const q = query(collection(db, "posts"), where("visibility", "==", "public"), where("topics", "array-contains", topic),
    orderBy("createdAt", "desc"), limit(100));
  return snapToList(await getDocs(q)).filter((p) => !p.groupId);
}

// Votes are final and private to the voter. The rules require the vote and
// the total to change in the same batch.
export async function votePostPoll(post, option) {
  const batch = writeBatch(db);
  batch.set(doc(db, "posts", post.id, "votes", me()), { option, createdAt: serverTimestamp() });
  batch.update(doc(db, "posts", post.id), { [`pollVotes${option}`]: increment(1) });
  await batch.commit();
}

export async function fetchMyVote(postId) {
  if (!me()) return null;
  const snap = await getDoc(doc(db, "posts", postId, "votes", me())).catch(() => null);
  return snap?.exists() ? snap.data().option : null;
}

export async function fetchVideos() {
  const [shorts, longs] = await Promise.all([
    fetchPostsByKind("short"),
    fetchPostsByKind("video").catch(() => []),
  ]);
  return [...shorts, ...longs].sort(byNewest);
}

/** Someone's posts: all of them for the author, public ones plus followers-only for a `follower`. */
export async function fetchPostsByAuthor(uid, { follower = false } = {}) {
  if (uid === me()) {
    return snapToList(await getDocs(query(collection(db, "posts"), where("authorId", "==", uid), orderBy("createdAt", "desc"), limit(100))));
  }
  const [open, followersOnly] = await Promise.all([
    getDocs(query(collection(db, "posts"), where("visibility", "==", "public"), where("authorId", "==", uid),
      orderBy("createdAt", "desc"), limit(100))).then(snapToList),
    follower ? fetchFollowersPosts([uid], { perAuthor: 100 }) : [],
  ]);
  return [...open, ...followersOnly].sort(byNewest);
}

// Followers-only posts by accounts the viewer follows. The rules check each
// author's follower list, so it's a query per author.
export async function fetchFollowersPosts(uids, { perAuthor = 10, maxAuthors = 100 } = {}) {
  const lists = await Promise.all([...uids].slice(0, maxAuthors).map((uid) => getDocs(query(
    collection(db, "posts"), where("visibility", "==", "followers"), where("authorId", "==", uid),
    orderBy("createdAt", "desc"), limit(perAuthor),
  )).then(snapToList).catch(() => [])));
  return lists.flat();
}

// Private circles post with visibility "circle"; posts from before a circle
// went private stay "public", so members read both.
export async function fetchGroupPosts(group, { member = false } = {}) {
  const byVis = (vis) => getDocs(query(
    collection(db, "posts"),
    where("visibility", "==", vis),
    where("groupId", "==", group.id),
    orderBy("createdAt", "desc"),
    limit(100)
  )).then(snapToList);
  if (group.privacy === "public") return byVis("public");
  if (!member) return [];
  const [circle, legacy] = await Promise.all([byVis("circle"), byVis("public").catch(() => [])]);
  return [...circle, ...legacy].sort(byNewest);
}

export async function fetchPendingPosts(groupId, { mine = false } = {}) {
  const q = mine
    ? query(collection(db, "posts"), where("authorId", "==", me()), where("groupId", "==", groupId), where("visibility", "==", "pending"), limit(50))
    : query(collection(db, "posts"), where("visibility", "==", "pending"), where("groupId", "==", groupId), limit(100));
  return snapToList(await getDocs(q)).sort(byNewest);
}

/** Edits a non-circle post. Resolves to the changed fields for optimistic merging. */
export async function editPost(post, { text, title = "", alt = "", topics = [], sensitive = false, visibility, location }) {
  const user = auth.currentUser;
  const changes = { text, title, alt, topics, sensitive, editedAt: serverTimestamp() };
  if (location !== undefined && location !== (post.location || "")) changes.location = location;
  if (visibility) changes.visibility = visibility;
  const batch = writeBatch(db);
  batch.update(doc(db, "posts", post.id), changes);
  batch.set(doc(db, "rateLimits", user.uid), { edit: serverTimestamp() }, { merge: true });
  await batch.commit();
  return { ...changes, editedAt: Timestamp.now() };
}

export async function approvePost(post, group) {
  await updateDoc(doc(db, "posts", post.id), { visibility: circleVisibility(group) });
}

export async function deleteInline(url) {
  if (isInline(url)) await deleteDoc(doc(db, "media", url.slice(INLINE_PREFIX.length))).catch(() => {});
}

export async function deletePost(post) {
  await deleteDoc(doc(db, "posts", post.id));
  await deleteInline(post.mediaUrl);
  for (const m of (post.media || []).slice(1)) await deleteInline(m.url).catch(() => {});
  if (post.mediaPath || post.posterUrl) {
    try {
      const { deleteObject, ref, storage } = await loadStorage();
      if (post.mediaPath) await deleteObject(ref(storage, post.mediaPath));
      if (post.posterUrl) await deleteObject(ref(storage, post.posterUrl));
    } catch {
      // Already gone; the post itself is what matters.
    }
  }
}

// Likes and affinity

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

// Affinity weights per interaction. Costlier actions (send, save, follow)
// count for more than a like; hide is a strong negative.
export const SIGNAL = {
  hide: -8,
  skip: -1,
  view: 0.25,
  complete: 1,
  replay: 1.5,
  like: 1,
  comment: 2,
  save: 3,
  send: 4,
  repost: 3.5,
  follow: 5,
};

export async function recordSignal(post, kind) {
  const weight = SIGNAL[kind];
  if (!weight || !post?.authorId) return;
  await bumpAffinity(post.authorId, weight).catch(() => {});
}

export async function bumpAffinity(authorId, amount) {
  if (!me() || !authorId || authorId === me()) return;
  await setDoc(
    doc(db, "users", me(), "affinity", authorId),
    { score: increment(amount), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Counters only change in the same batch as the record they count; the rules check both.
export async function toggleLike(post, currentlyLiked) {
  const uid = me();
  const likeRef = doc(db, "posts", post.id, "likes", uid);
  const postRef = doc(db, "posts", post.id);
  const batch = writeBatch(db);
  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(postRef, { likeCount: increment(-1) });
    await batch.commit();
    unnotify(post.authorId, "like", { postId: post.id });
  } else {
    const profile = await myProfile();
    batch.set(likeRef, { username: profile?.username || "", createdAt: serverTimestamp() });
    batch.update(postRef, { likeCount: increment(1) });
    await batch.commit();
    bumpAffinity(post.authorId, SIGNAL.like).catch(() => {});
    notify(post.authorId, "like", { postId: post.id });
  }
}

export async function fetchLikers(postId, n = 2) {
  const snap = await getDocs(query(collection(db, "posts", postId, "likes"), limit(8))).catch(() => null);
  return (snap?.docs || [])
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.username)
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))
    .slice(0, n);
}

export async function fetchAffinity() {
  if (!me()) return new Map();
  const q = query(collection(db, "users", me(), "affinity"), limit(200));
  const map = new Map();
  (await getDocs(q)).docs.forEach((d) => map.set(d.id, d.data().score || 0));
  return map;
}

// Saves and sends

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
  const batch = writeBatch(db);
  if (currentlySaved) {
    batch.delete(saveRef);
    batch.delete(doc(db, "users", uid, "saved", post.id));
    batch.update(postRef, { saveCount: increment(-1) });
    await batch.commit();
  } else {
    batch.set(saveRef, { createdAt: serverTimestamp() });
    batch.set(doc(db, "users", uid, "saved", post.id), { createdAt: serverTimestamp() });
    batch.update(postRef, { saveCount: increment(1) });
    await batch.commit();
    bumpAffinity(post.authorId, SIGNAL.save).catch(() => {});
  }
}

export async function fetchSavedPosts() {
  // The user's own mirror, rather than a collection-group query over posts.
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

// The message carries a snapshot of the post so the preview renders without a read.
export async function sendPostTo(post, chatId, note = "") {
  const uid = me();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "chats", chatId, "messages")), {
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
  batch.update(doc(db, "chats", chatId), {
    lastMessage: `Shared a ${kindLabel(post).toLowerCase()}`,
    lastSenderId: uid,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  // sendCount counts distinct senders, keyed by a per-sender marker.
  const sendRef = doc(db, "posts", post.id, "sends", uid);
  const already = await getDoc(sendRef).catch(() => null);
  if (!already?.exists()) {
    const b2 = writeBatch(db);
    b2.set(sendRef, { createdAt: serverTimestamp() });
    b2.update(doc(db, "posts", post.id), { sendCount: increment(1) });
    await b2.commit().catch(() => {});
  }
  bumpAffinity(post.authorId, SIGNAL.send).catch(() => {});
}

// Reposts: one doc per (post, user). Only public posts can be reposted.

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
  const batch = writeBatch(db);
  if (currentlyReposted) {
    batch.delete(ref_);
    batch.update(postRef, { repostCount: increment(-1) });
    await batch.commit();
    unnotify(post.authorId, "repost", { postId: post.id });
  } else {
    const profile = await myProfile();
    batch.set(ref_, {
      postId: post.id,
      postAuthorId: post.authorId,
      uid,
      username: profile?.username || "",
      createdAt: serverTimestamp(),
    });
    batch.update(postRef, { repostCount: increment(1) });
    await batch.commit();
    bumpAffinity(post.authorId, SIGNAL.repost).catch(() => {});
    notify(post.authorId, "repost", { postId: post.id });
  }
}

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

export async function fetchRepostedPosts(uid) {
  const reposts = await fetchRepostsBy([uid], 50);
  const posts = await Promise.all(reposts.map((r) => fetchPost(r.postId).catch(() => null)));
  return posts
    .map((p, i) => (p ? { ...p, repostedAt: reposts[i].createdAt } : null))
    .filter(Boolean);
}

export async function fetchPost(postId) {
  const snap = await getDoc(doc(db, "posts", postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function openPost(postId) {
  navigate(`/p/${encodeURIComponent(postId)}`, { overlay: true });
}

export function openWatch(postId) {
  navigate(`/watch/${encodeURIComponent(postId)}`, { overlay: true });
}

// Hides

export async function hidePost(post, reason = "not_interested") {
  await setDoc(doc(db, "users", me(), "hidden", post.id), {
    authorId: post.authorId,
    reason,
    createdAt: serverTimestamp(),
  });
  bumpAffinity(post.authorId, SIGNAL.hide).catch(() => {});
}

export async function fetchHiddenPostIds() {
  if (!me()) return new Set();
  const q = query(collection(db, "users", me(), "hidden"), limit(500));
  const set = new Set();
  (await getDocs(q)).docs.forEach((d) => set.add(d.id));
  return set;
}

// Comments

export async function fetchComments(postId) {
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(200));
  return snapToList(await getDocs(q));
}

export async function fetchTopComment(postId) {
  const snap = await getDocs(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(1))).catch(() => null);
  const d = snap?.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

/** `parent` is the comment being replied to; `image` is { url, w, h } from uploadMedia. */
export async function addComment(post, text, { gif = null, image = null, parent = null, sensitive = false } = {}) {
  const user = auth.currentUser;
  const profile = await myProfile();
  const comment = {
    authorId: user.uid,
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text,
    ...(gif ? { gif } : {}),
    ...(image ? { image } : {}),
    ...(parent ? { parentId: parent.id } : {}),
    ...(sensitive ? { sensitive: true } : {}),
    likeCount: 0,
    createdAt: serverTimestamp(),
  };
  // lastCommentId lets the rules tie the count change to this comment.
  const ref_ = doc(collection(db, "posts", post.id, "comments"));
  const batch = writeBatch(db);
  batch.set(ref_, comment);
  batch.set(doc(db, "rateLimits", user.uid), { comment: serverTimestamp() }, { merge: true });
  batch.update(doc(db, "posts", post.id), { commentCount: increment(1), lastCommentId: ref_.id });
  await batch.commit();
  bumpAffinity(post.authorId, SIGNAL.comment).catch(() => {});
  const notice = { postId: post.id, commentId: ref_.id, text: text.slice(0, 140) };
  if (parent) notify(parent.authorId, "reply", notice);
  if (!parent || parent.authorId !== post.authorId) notify(post.authorId, "comment", notice);
  return { id: ref_.id, ...comment, createdAt: Timestamp.now() };
}

export async function toggleCommentLike(post, comment, liked) {
  const uid = me();
  const ref_ = doc(db, "posts", post.id, "comments", comment.id);
  const batch = writeBatch(db);
  if (liked) batch.delete(doc(ref_, "likes", uid));
  else batch.set(doc(ref_, "likes", uid), { createdAt: serverTimestamp() });
  batch.update(ref_, { likeCount: increment(liked ? -1 : 1), lastLiker: uid });
  await batch.commit();
}

/** Ids of the comments the viewer has liked. Only comments with likes are checked. */
export async function fetchMyCommentLikes(postId, comments) {
  const uid = me();
  if (!uid) return new Set();
  const liked = new Set();
  await Promise.all(comments.filter((c) => (c.likeCount || 0) > 0).map(async (c) => {
    const snap = await getDoc(doc(db, "posts", postId, "comments", c.id, "likes", uid)).catch(() => null);
    if (snap?.exists()) liked.add(c.id);
  }));
  return liked;
}

export async function deleteCommentAndCount(postId, commentId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "posts", postId, "comments", commentId));
  batch.update(doc(db, "posts", postId), { commentCount: increment(-1), lastCommentId: commentId });
  try { await batch.commit(); }
  catch (err) {
    // Post deleted or count already settled: remove the comment alone.
    if (err?.code !== "permission-denied" && err?.code !== "not-found") throw err;
    await deleteDoc(doc(db, "posts", postId, "comments", commentId));
  }
}

export async function deleteComment(post, comment) {
  await deleteCommentAndCount(post.id, comment.id);
  if (comment.image?.url) await deleteInline(comment.image.url).catch(() => {});
}
