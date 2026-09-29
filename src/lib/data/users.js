// Accounts and profiles, handles, interests, follows, follow requests, blocking, privacy settings, people search and spouse links.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, documentId, endAt, getDoc, getDocs, increment, limit,
  orderBy, query, serverTimestamp, setDoc, startAt, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { bumpAffinity, deleteInline, fetchPostsByAuthor, SIGNAL } from "./posts.js";
import { uploadMedia } from "./uploads.js";
import { notify, unnotify } from "./notifications.js";

// ---------- users & profiles ----------

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Bump this when the terms or privacy policy change materially. Existing
   accounts keep the version they accepted, which is what lets you tell who
   still needs to see a change notice. */
export const POLICY_VERSION = "2026-09-29.2";

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

export async function fetchProfileByUsername(username) {
  const reg = await getDoc(doc(db, "usernames", username)).catch(() => null);
  const uid = reg?.exists() ? reg.data().uid : null;
  return uid ? fetchProfile(uid) : null;
}

const handleCache = new Map(); // handle -> uid | null, for this visit
/** The account behind an @handle, or null if there isn't one. */
export async function uidForUsername(username) {
  const handle = String(username || "").toLowerCase().replace(/^@/, "");
  if (!handleCache.has(handle)) {
    const reg = await getDoc(doc(db, "usernames", handle)).catch(() => null);
    handleCache.set(handle, reg?.exists() ? reg.data().uid : null);
  }
  return handleCache.get(handle);
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
  const previous = (await fetchProfile(me()).catch(() => null))?.photoURL;
  const { url } = await uploadMedia(file, onProgress, "avatars");
  await updateDoc(doc(db, "users", me()), { photoURL: url });
  await deleteInline(previous);
  return url;
}

// ---------- your interests (private) ----------
// Stored where only you can read them, and used only to order and filter
// what you see. Never shown on your profile.

export async function fetchMyPrefs() {
  const snap = await getDoc(doc(db, "users", me(), "private", "prefs")).catch(() => null);
  return snap?.exists() ? snap.data() : { interests: [] };
}

/** Words and phrases you never want to see: posts and comments with them are hidden for you. */
export async function saveHiddenWords(words) {
  const clean = [...new Set(words.map((w) => w.trim().toLowerCase()).filter(Boolean))].slice(0, 200).map((w) => w.slice(0, 60));
  await setDoc(doc(db, "users", me(), "private", "prefs"), { hiddenWords: clean, updatedAt: serverTimestamp() }, { merge: true });
  return clean;
}

/** Mute or unmute someone: their posts, Flicks, stories and comments stop
    showing for you. Unlike a block they can still message you, and they
    aren't told. Kept with your other private preferences. */
export async function setMuted(uid, on) {
  await setDoc(doc(db, "users", me(), "private", "prefs"), {
    muted: on ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveMyInterests(interests) {
  await setDoc(doc(db, "users", me(), "private", "prefs"), {
    interests: interests.slice(0, 12),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ---------- follows ----------

export async function fetchMyFollowingSet() {
  const q = query(collection(db, "users", me(), "following"), limit(500));
  const set = new Set();
  (await getDocs(q)).docs.forEach((d) => set.add(d.id));
  return set;
}

/** Does `uid` follow you? Calls need it: only followers can be rung. */
export async function followsMe(uid) {
  const snap = await getDoc(doc(db, "users", uid, "following", me())).catch(() => null);
  return !!snap?.exists();
}

/* Follow or unfollow. A private (locked) account can't be followed
   directly: you send a request and they approve it. Returns what happened:
   "following", "requested" or "unfollowed". */
export async function toggleFollow(target, currentlyFollowing) {
  const uid = me();
  const followingRef = doc(db, "users", uid, "following", target.id);
  const followerRef = doc(db, "users", target.id, "followers", uid);
  if (currentlyFollowing) {
    const batch = writeBatch(db);
    batch.delete(followingRef);
    batch.delete(followerRef);
    // lastFollowing / lastFollower name the relationship each count moved
    // for, so the rules can check it really changed in this same write.
    batch.update(doc(db, "users", uid), { followingCount: increment(-1), lastFollowing: target.id });
    batch.update(doc(db, "users", target.id), { followerCount: increment(-1), lastFollower: uid });
    await batch.commit();
    unnotify(target.id, "follow");
    return "unfollowed";
  }
  const full = target.isPrivate === undefined ? await fetchProfile(target.id) : target;
  if (full?.isPrivate) {
    await requestFollow(target);
    return "requested";
  }
  const myProfile = await fetchProfile(uid);
  const batch = writeBatch(db);
  batch.set(followingRef, { username: full?.username || target.username || "", createdAt: serverTimestamp() });
  batch.set(followerRef, { username: myProfile?.username || "", createdAt: serverTimestamp() });
  batch.update(doc(db, "users", uid), { followingCount: increment(1), lastFollowing: target.id });
  batch.update(doc(db, "users", target.id), { followerCount: increment(1), lastFollower: uid });
  await batch.commit();
  bumpAffinity(target.id, SIGNAL.follow).catch(() => {});
  notify(target.id, "follow");
  return "following";
}

// --- follow requests (private accounts) ---

export async function requestFollow(target) {
  const profile = await fetchProfile(me());
  await setDoc(doc(db, "users", target.id, "followRequests", me()), {
    username: profile?.username || "",
    createdAt: serverTimestamp(),
  });
  notify(target.id, "request");
}

export async function cancelFollowRequest(targetId) {
  await deleteDoc(doc(db, "users", targetId, "followRequests", me()));
  unnotify(targetId, "request");
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
  const [profile, requester] = await Promise.all([fetchProfile(uid), fetchProfile(request.id)]);
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "followers", request.id), { username: requester?.username || "", createdAt: serverTimestamp() });
  batch.set(doc(db, "users", request.id, "following", uid), { username: profile?.username || "", createdAt: serverTimestamp() });
  batch.update(doc(db, "users", uid), { followerCount: increment(1), lastFollower: request.id });
  batch.update(doc(db, "users", request.id), { followingCount: increment(1), lastFollowing: uid });
  batch.delete(doc(db, "users", uid, "followRequests", request.id));
  await batch.commit();
  notify(request.id, "accept");
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
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", uid, "followers", target.id));
    batch.delete(doc(db, "users", target.id, "following", uid));
    batch.update(doc(db, "users", uid), { followerCount: increment(-1), lastFollower: target.id });
    batch.update(doc(db, "users", target.id), { followingCount: increment(-1), lastFollowing: uid });
    await batch.commit().catch(() => {});
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
