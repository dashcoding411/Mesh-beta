// Your data: export, and deleting your account.
import { collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { fetchGroups } from "./circles.js";
import { me } from "./core.js";
import { fetchEvents } from "./events.js";
import { deletePost, fetchComments, fetchPostsByAuthor, fetchRepostsBy } from "./posts.js";
import { fetchFollowList, fetchMyPrefs, fetchProfile } from "./users.js";

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
  const prefs = await fetchMyPrefs().catch(() => null);
  const limits = await getDoc(doc(db, "locks", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const usage = await getDocs(query(collection(db, "usage"), where("uid", "==", uid))).then((s) => s.docs.map((d) => ({ day: d.id.split("_")[1], ...d.data() }))).catch(() => []);
  const notifications = await getDocs(query(collection(db, "users", uid, "notifications"), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
  const family = await getDoc(doc(db, "familyLinks", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
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
    brickMode: { limits, usage, parentLink: family },
    gatheringReplies: gatherings,
    notifications,
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
  // Private lists and signals, then who you follow (and your entry in their
  // followers), then the profile itself.
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
  // Stories, then every photo you stored (posts, stories, avatar, news covers).
  const mine = async (col, field) => {
    const snap = await getDocs(query(collection(db, col), where(field, "==", uid), limit(500))).catch(() => null);
    return snap?.docs || [];
  };
  for (const d of await mine("stories", "authorId")) await deleteDoc(d.ref).catch(() => {});
  for (const d of await mine("media", "ownerId")) await deleteDoc(d.ref).catch(() => {});
  // The profile and its handle go together, so the handle is released only
  // as the profile stops using it.
  const last = writeBatch(db);
  last.delete(doc(db, "users", uid));
  if (profile?.username) last.delete(doc(db, "usernames", profile.username));
  // Teens you supervise: take your limits off, then end the link.
  for (const d of await mine("familyLinks", "parentId")) {
    await updateDoc(doc(db, "locks", d.id), { parent: null, parentRequest: null, updatedAt: serverTimestamp() }).catch(() => {});
    await deleteDoc(d.ref).catch(() => {});
  }
  await last.commit().catch(() => deleteDoc(doc(db, "users", uid)).catch(() => {}));
  await deleteDoc(doc(db, "rateLimits", uid)).catch(() => {});
  // Brick mode's records can only go once the profile has (the rules
  // won't let limits be lifted any other way).
  for (const d of await mine("usage", "uid")) await deleteDoc(d.ref).catch(() => {});
  await deleteDoc(doc(db, "locks", uid)).catch(() => {});
  await deleteDoc(doc(db, "familyLinks", uid)).catch(() => {});
}
