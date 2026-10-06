// Mesh staff: admins (set in the console) and the moderators they appoint.
import {
  arrayUnion, collection, collectionGroup, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { isAdmin } from "./news.js";

let roleCheck = { uid: null, result: null };

/** "admin", "moderator" or null. Checked once per visit. */
export function staffRole() {
  const uid = me();
  if (!uid) return Promise.resolve(null);
  if (roleCheck.uid !== uid) {
    roleCheck = {
      uid,
      result: Promise.all([
        isAdmin(),
        getDoc(doc(db, "moderators", uid)).then((s) => s.exists()).catch(() => false),
      ]).then(([admin, mod]) => (admin ? "admin" : mod ? "moderator" : null)),
    };
    roleCheck.result.catch(() => { roleCheck = { uid: null, result: null }; });
  }
  return roleCheck.result;
}

export async function fetchModerators() {
  return snapToList(await getDocs(query(collection(db, "moderators"), limit(200))));
}

/** Staff only. `username` must belong to `uid` (the rules check). */
export async function addModerator({ uid, username }) {
  await setDoc(doc(db, "moderators", uid), { username, addedBy: me(), addedAt: serverTimestamp() });
}

export async function removeModerator(uid) {
  await deleteDoc(doc(db, "moderators", uid));
  if (uid === me()) roleCheck = { uid: null, result: null };
}

// Activity, for the staff stats: when each account was last active and which
// of its first 60 days it came back on. No content and no times of day; one
// write a day per device at most, readable by the owner and staff only.

export const ACTIVITY_DAYS = 60;
// The day activity records began; earlier sign-ups can't show whether they came back.
export const ACTIVITY_SINCE = new Date(2026, 9, 5).getTime();

export async function recordActivity(profile) {
  const uid = me();
  if (!uid || !profile?.createdAt?.toMillis) return;
  const key = `mesh:active:${uid}`;
  const today = new Date().toDateString();
  try { if (localStorage.getItem(key) === today) return; } catch { return; }
  const day = Math.floor((Date.now() - tsMillis(profile.createdAt)) / 86400000);
  const data = { joinedAt: profile.createdAt, lastActiveAt: serverTimestamp() };
  if (day >= 0 && day <= ACTIVITY_DAYS) data.days = arrayUnion(day);
  await setDoc(doc(db, "activity", uid), data, { merge: true });
  try { localStorage.setItem(key, today); } catch { /* storage blocked */ }
}

export async function fetchMyActivity() {
  const snap = await getDoc(doc(db, "activity", me())).catch(() => null);
  return snap?.exists() ? snap.data() : null;
}

export async function deleteMyActivity() {
  await deleteDoc(doc(db, "activity", me())).catch(() => {});
}

/** Everything the staff stats page shows. Staff only (the rules). */
export async function fetchStaffStats(now = Date.now()) {
  const DAY = 86400000;
  const ts = (ms) => Timestamp.fromMillis(ms);
  const count = (q) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);
  const [members, signups, activity, posts, gatherings, circles, stories, reports] = await Promise.all([
    count(collection(db, "users")),
    getDocs(query(collection(db, "users"), where("createdAt", ">=", ts(now - 30 * DAY)), orderBy("createdAt", "asc"), limit(5000)))
      .then((s) => s.docs.map((d) => tsMillis(d.data().createdAt))).catch(() => null),
    getDocs(query(collection(db, "activity"), limit(5000)))
      .then((s) => s.docs.map((d) => ({ joined: tsMillis(d.data().joinedAt), last: tsMillis(d.data().lastActiveAt), days: d.data().days || [] }))).catch(() => null),
    count(query(collection(db, "posts"), where("visibility", "==", "public"), where("groupId", "==", ""), where("createdAt", ">=", ts(now - 7 * DAY)), orderBy("createdAt", "desc"))),
    count(query(collection(db, "events"), where("privacy", "==", "public"), where("startsAt", ">=", ts(now)), orderBy("startsAt", "asc"))),
    count(query(collection(db, "groups"), where("privacy", "in", ["public", "private"]))),
    count(query(collection(db, "news"), where("status", "==", "approved"))),
    count(query(collection(db, "reports"), where("status", "==", "open"))),
  ]);
  return { members, signups, activity, posts, gatherings, circles, stories, reports, fresh: await fetchFreshActivity(now) };
}

/**
 * The last day's likes, comments and reposts from accounts under a week old
 * (lib/fresh.js), as [{ postId, kind, at }], for spotting fake crowds. Null
 * when they can't be read.
 */
export async function fetchFreshActivity(now = Date.now()) {
  const since = Timestamp.fromMillis(now - 86400000);
  const recent = (q) => getDocs(query(q, where("fresh", "==", true), where("createdAt", ">=", since), orderBy("createdAt", "desc"), limit(3000)));
  try {
    const [likes, comments, reposts] = await Promise.all([
      recent(collectionGroup(db, "likes")),
      recent(collectionGroup(db, "comments")),
      recent(collection(db, "reposts")),
    ]);
    // posts/{postId}/likes/…, posts/{postId}/comments/{id}/likes/… and posts/{postId}/comments/…
    const onPost = (d) => (d.ref.path.startsWith("posts/") ? d.ref.path.split("/")[1] : null);
    return [
      ...likes.docs.map((d) => ({ postId: onPost(d), kind: d.ref.path.includes("/comments/") ? "comment like" : "like", at: tsMillis(d.data().createdAt) })),
      ...comments.docs.map((d) => ({ postId: onPost(d), kind: "comment", at: tsMillis(d.data().createdAt) })),
      ...reposts.docs.map((d) => ({ postId: d.data().postId, kind: "repost", at: tsMillis(d.data().createdAt) })),
    ].filter((r) => r.postId && r.at);
  } catch (err) {
    console.error(err);
    return null;
  }
}
