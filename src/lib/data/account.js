// Data export and account deletion.
import { collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { fetchGroups } from "./circles.js";
import { me } from "./core.js";
import { fetchEvents } from "./events.js";
import { deleteNews } from "./news.js";
import { deleteStory } from "./stories.js";
import { deletePost, fetchComments, fetchPostsByAuthor, fetchRepostsBy } from "./posts.js";
import { fetchFollowList, fetchMyPrefs, myProfile } from "./users.js";

export async function exportMyData() {
  const uid = me();
  const [profile, posts, groups, events, following, followers] = await Promise.all([
    myProfile(),
    fetchPostsByAuthor(uid),
    fetchGroups().then((gs) => gs.filter((g) => g.ownerId === uid)),
    fetchEvents().then((es) => es.filter((e) => e.hostId === uid)),
    fetchFollowList(uid, "following"),
    fetchFollowList(uid, "followers"),
  ]);
  const reposts = await fetchRepostsBy([uid], 500).catch(() => []);
  const prefs = await fetchMyPrefs().catch(() => null);
  const limits = await getDoc(doc(db, "locks", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const usage = await getDocs(query(collection(db, "usage"), where("uid", "==", uid))).then((s) => s.docs.map((d) => ({ day: d.id.split("_")[1], ...d.data() }))).catch(() => []);
  const notifications = await getDocs(query(collection(db, "users", uid, "notifications"), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
  const family = await getDoc(doc(db, "familyLinks", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const brickedTime = await getDoc(doc(db, "brickStats", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const gatherings = await getDocs(query(collection(db, "users", uid, "rsvps"), limit(500))).then((s) => s.docs.map((d) => ({ gatheringId: d.id, ...d.data() }))).catch(() => []);
  const comments = [];
  for (const p of posts) {
    const cs = await fetchComments(p.id).catch(() => []);
    comments.push(...cs.filter((c) => c.authorId === uid).map((c) => ({ postId: p.id, ...c })));
  }
  return {
    exportedAt: new Date().toISOString(),
    account: { uid, email: auth.currentUser?.email || "", phone: auth.currentUser?.phoneNumber || "" },
    profile,
    interests: prefs?.interests || [],
    posts,
    comments,
    reposts: reposts.map(({ postId, createdAt }) => ({ postId, createdAt })),
    groupsOwned: groups,
    eventsHosted: events,
    following,
    followers,
    hiddenWords: prefs?.hiddenWords || [],
    mutedAccounts: prefs?.muted || [],
    brickMode: { limits, usage, parentLink: family, brickedTime },
    gatheringReplies: gatherings,
    notifications,
  };
}

// Best effort: anything the rules refuse is left rather than failing the whole wipe.
export async function deleteMyAccountData() {
  const uid = me();
  const profile = await myProfile().catch(() => null);
  const posts = await fetchPostsByAuthor(uid).catch(() => []);
  for (const p of posts) {
    await deletePost(p).catch(() => {});
  }
  const reposts = await fetchRepostsBy([uid], 500).catch(() => []);
  for (const r of reposts) {
    await deleteDoc(doc(db, "reposts", r.id)).catch(() => {});
    await updateDoc(doc(db, "posts", r.postId), { repostCount: increment(-1) }).catch(() => {});
  }
  const sub = async (name) => {
    const snap = await getDocs(query(collection(db, "users", uid, name), limit(500))).catch(() => null);
    return snap?.docs || [];
  };
  for (const name of ["affinity", "saved", "hidden", "blocked", "followRequests", "notifications", "rsvps"]) {
    for (const d of await sub(name)) await deleteDoc(d.ref).catch(() => {});
  }
  for (const d of await sub("following")) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", d.id, "followers", uid));
    batch.delete(d.ref);
    batch.update(doc(db, "users", d.id), { followerCount: increment(-1), lastFollower: uid });
    await batch.commit().catch(() => deleteDoc(d.ref).catch(() => {}));
  }
  await deleteDoc(doc(db, "thoughts", uid)).catch(() => {});
  await deleteDoc(doc(db, "users", uid, "private", "prefs")).catch(() => {});
  const mine = async (col, field) => {
    const snap = await getDocs(query(collection(db, col), where(field, "==", uid), limit(500))).catch(() => null);
    return snap?.docs || [];
  };
  for (const d of await mine("stories", "authorId")) await deleteStory({ id: d.id, ...d.data() }).catch(() => deleteDoc(d.ref).catch(() => {}));
  for (const d of await mine("news", "authorId")) await deleteNews(d.id).catch(() => {});
  for (const d of await mine("media", "ownerId")) await deleteDoc(d.ref).catch(() => {});
  // Profile and handle together, so the handle is only released with the profile.
  const last = writeBatch(db);
  last.delete(doc(db, "users", uid));
  if (profile?.username) last.delete(doc(db, "usernames", profile.username));
  // Lift parental limits on linked teens before removing the links.
  for (const d of await mine("familyLinks", "parentId")) {
    await updateDoc(doc(db, "locks", d.id), { parent: null, parentRequest: null, updatedAt: serverTimestamp() }).catch(() => {});
    await deleteDoc(d.ref).catch(() => {});
  }
  await last.commit().catch(() => deleteDoc(doc(db, "users", uid)).catch(() => {}));
  await deleteDoc(doc(db, "rateLimits", uid)).catch(() => {});
  await deleteDoc(doc(db, "brickStats", uid)).catch(() => {});
  await deleteDoc(doc(db, "newsWriters", uid)).catch(() => {});
  // Lock records are only deletable once the profile is gone.
  for (const d of await mine("usage", "uid")) await deleteDoc(d.ref).catch(() => {});
  await deleteDoc(doc(db, "locks", uid)).catch(() => {});
  await deleteDoc(doc(db, "familyLinks", uid)).catch(() => {});
}
