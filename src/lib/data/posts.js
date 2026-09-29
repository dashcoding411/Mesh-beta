// Posts and everything done to them: likes, saves, sends, reposts, hides and comments.
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "../../firebase";
import { navigate } from "../router";
import { INLINE_PREFIX, isInline } from "../media";
import { circleVisibility } from "./circles.js";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchProfile, uidForUsername } from "./users.js";
import { mentionedHandles, notify, unnotify } from "./notifications.js";

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

export const POLL_DURATIONS = [
  { id: 1, label: "1 hour", hours: 1 },
  { id: 24, label: "1 day", hours: 24 },
  { id: 72, label: "3 days", hours: 72 },
  { id: 168, label: "1 week", hours: 168 },
];

export async function createPost({
  kind, text, title, alt, mediaUrl, mediaPath, mediaType, groupId, visibility,
  duration = 0, trailerStart = 0, aiGenerated = false, topics = [], poll = null, gif = null, sensitive = false,
  circleTopic = "",
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
    topics: topics.slice(0, 3),
    // A Strand can carry a poll (2–4 options) or a GIF from GIPHY. Votes are
    // counted per option here and recorded privately per voter; see votePoll.
    ...(poll ? {
      poll: { options: poll.options, endsAt: Timestamp.fromMillis(Date.now() + poll.hours * 3600e3) },
      pollVotes0: 0, pollVotes1: 0, pollVotes2: 0, pollVotes3: 0,
    } : {}),
    ...(gif ? { gif } : {}),
    // Let through on context (quoting or calling out abuse, or borderline
    // mockery). Viewers' apps fold or limit it, and the server only accepts
    // a slur when this is set, so a slur can never go out unlabelled.
    ...(sensitive ? { sensitive: true } : {}),
    // One of the circle's own topics, so members can filter the discussion.
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
  // The post and a rate-limit stamp go together: the rules allow one post
  // every ten seconds per account, so a script can't flood the feed.
  const refDoc = doc(collection(db, "posts"));
  const batch = writeBatch(db);
  batch.set(refDoc, post);
  batch.set(doc(db, "rateLimits", user.uid), { post: serverTimestamp() }, { merge: true });
  // In a circle, your last-post time goes with it (a circle's slow mode reads it).
  if (groupId) batch.update(doc(db, "groups", groupId, "members", user.uid), { lastPostAt: serverTimestamp() });
  await batch.commit();
  // Tell anyone @mentioned in a public post. Followers-only and circle posts
  // don't notify: the person might not be able to open them.
  if (post.visibility === "public") {
    mentionedHandles(post.text).forEach(async (handle) => {
      const uid = await uidForUsername(handle).catch(() => null);
      if (uid) notify(uid, "mention", { postId: refDoc.id, text: post.text.slice(0, 140) });
    });
  }
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

/** Public posts tagged with an interest, for the feed's interest chips. */
export async function fetchTopicPosts(topic) {
  const q = query(collection(db, "posts"), where("visibility", "==", "public"), where("topics", "array-contains", topic), limit(100));
  return snapToList(await getDocs(q)).filter((p) => !p.groupId).sort(byNewest);
}

/* Poll voting. One vote per person, final, and anonymous: the vote record
   is readable only by the voter, and the post only holds totals. The vote
   and the total move together in one write, which the rules require. */
export async function votePostPoll(post, option) {
  const batch = writeBatch(db);
  batch.set(doc(db, "posts", post.id, "votes", me()), { option, createdAt: serverTimestamp() });
  batch.update(doc(db, "posts", post.id), { [`pollVotes${option}`]: increment(1) });
  await batch.commit();
}

export async function fetchMyVote(postId) {
  const snap = await getDoc(doc(db, "posts", postId, "votes", me())).catch(() => null);
  return snap?.exists() ? snap.data().option : null;
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

/** Change the words on one of your own posts (not in a circle). Stamps
    `editedAt`, which the rules require and every card shows as "Edited".
    Returns the fields that changed, to merge into what's on screen. */
export async function editPost(post, { text, title = "", alt = "", topics = [], sensitive = false, visibility }) {
  const user = auth.currentUser;
  const changes = { text, title, alt, topics, sensitive, editedAt: serverTimestamp() };
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

// A photo kept in Firestore goes with the post, story or avatar that used it.
export async function deleteInline(url) {
  if (isInline(url)) await deleteDoc(doc(db, "media", url.slice(INLINE_PREFIX.length))).catch(() => {});
}

export async function deletePost(post) {
  await deleteDoc(doc(db, "posts", post.id));
  await deleteInline(post.mediaUrl);
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

export async function bumpAffinity(authorId, amount) {
  if (!authorId || authorId === me()) return;
  await setDoc(
    doc(db, "users", me(), "affinity", authorId),
    { score: increment(amount), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Counters move only in the same batch as the record they count (a like,
// a save, a follow...). The rules check both together, so a count can't be
// pushed around on its own, and a double tap can't count twice.
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
    const profile = await fetchProfile(uid);
    batch.set(likeRef, { username: profile?.username || "", createdAt: serverTimestamp() });
    batch.update(postRef, { likeCount: increment(1) });
    await batch.commit();
    bumpAffinity(post.authorId, SIGNAL.like).catch(() => {});
    notify(post.authorId, "like", { postId: post.id });
  }
}

/** A couple of recent likers, for "Liked by @a and 12 others". */
export async function fetchLikers(postId, n = 2) {
  const snap = await getDocs(query(collection(db, "posts", postId, "likes"), limit(8))).catch(() => null);
  return (snap?.docs || [])
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.username)
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))
    .slice(0, n);
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
  // The send count is the number of different people who passed it on, so
  // it's recorded once per person, with its marker, in its own batch.
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
  const batch = writeBatch(db);
  if (currentlyReposted) {
    batch.delete(ref_);
    batch.update(postRef, { repostCount: increment(-1) });
    await batch.commit();
    unnotify(post.authorId, "repost", { postId: post.id });
  } else {
    const profile = await fetchProfile(uid);
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

// ---------- comments ----------

export async function fetchComments(postId) {
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(200));
  return snapToList(await getDocs(q));
}

/** The first comment on a post, shown under it in the feed. */
export async function fetchTopComment(postId) {
  const snap = await getDocs(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(1))).catch(() => null);
  const d = snap?.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

export async function addComment(post, text, gif = null, sensitive = false) {
  const user = auth.currentUser;
  const profile = await fetchProfile(user.uid);
  const comment = {
    authorId: user.uid,
    authorName: profile?.username || "unknown",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text,
    ...(gif ? { gif } : {}),
    ...(sensitive ? { sensitive: true } : {}),
    createdAt: serverTimestamp(),
  };
  // The comment and the post's count go in one batch; `lastCommentId` names
  // the comment so the rules can check the count moved because of it.
  const ref_ = doc(collection(db, "posts", post.id, "comments"));
  const batch = writeBatch(db);
  batch.set(ref_, comment);
  batch.set(doc(db, "rateLimits", user.uid), { comment: serverTimestamp() }, { merge: true });
  batch.update(doc(db, "posts", post.id), { commentCount: increment(1), lastCommentId: ref_.id });
  await batch.commit();
  bumpAffinity(post.authorId, SIGNAL.comment).catch(() => {});
  notify(post.authorId, "comment", { postId: post.id, commentId: ref_.id, text: text.slice(0, 140) });
  return { id: ref_.id, ...comment, createdAt: Timestamp.now() };
}

export async function deleteCommentAndCount(postId, commentId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "posts", postId, "comments", commentId));
  batch.update(doc(db, "posts", postId), { commentCount: increment(-1), lastCommentId: commentId });
  try { await batch.commit(); }
  catch (err) {
    // The post may be gone, or its count already settled: still remove the comment.
    if (err?.code !== "permission-denied" && err?.code !== "not-found") throw err;
    await deleteDoc(doc(db, "posts", postId, "comments", commentId));
  }
}

/** Your own comment, or any comment on your own post. */
export async function deleteComment(post, commentId) {
  await deleteCommentAndCount(post.id, commentId);
}
