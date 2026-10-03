// Profiles, handles, private preferences, follows, blocking and privacy.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, documentId, endAt, getDoc, getDocs, increment, limit,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, startAt, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { navigate } from "../router";
import { me, snapToList, tsMillis } from "./core.js";
import { bumpAffinity, deleteInline, fetchPostsByAuthor, SIGNAL } from "./posts.js";
import { uploadMedia } from "./uploads.js";
import { notify, unnotify } from "./notifications.js";

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? rememberHandle({ id: snap.id, ...snap.data() }) : null;
}

// Birth year is owner-only so profiles can be read without an account.
const ageRef = (uid) => doc(db, "users", uid, "private", "age");

export async function fetchMyBirthYear() {
  const snap = await getDoc(ageRef(me()));
  if (snap.exists()) return snap.data().birthYear;
  return (await myProfile())?.birthYear || 0;
}

export async function setMyBirthYear(year) {
  await setDoc(ageRef(me()), { birthYear: year });
}

/**
 * Own profile with the birth year merged in. Profiles are readable by every
 * signed-in account, so anything private left on an older one is moved off:
 * a birth year to private/age, and email and phone (kept by Firebase Auth)
 * removed. Follow markers left from an interrupted follow are blanked.
 */
export async function fetchOwnProfile(uid) {
  const [profile, age] = await Promise.all([fetchProfile(uid), getDoc(ageRef(uid)).catch(() => null)]);
  if (!profile) return null;
  const stored = age?.exists() ? age.data().birthYear : 0;
  const legacy = ["email", "phone"].filter((k) => k in profile);
  if (profile.birthYear > 0 || legacy.length) {
    const batch = writeBatch(db);
    if (profile.birthYear > 0 && !stored) batch.set(ageRef(uid), { birthYear: profile.birthYear });
    batch.update(doc(db, "users", uid), Object.fromEntries(
      [...legacy, ...(profile.birthYear > 0 ? ["birthYear"] : [])].map((k) => [k, deleteField()])));
    await batch.commit().catch(() => {});
  }
  if (profile.lastFollower || profile.lastFollowing) clearFollowMarkers(uid);
  const { email: _email, phone: _phone, ...clean } = profile;
  return { ...clean, birthYear: stored || profile.birthYear || 0 };
}

/**
 * Follow counts are tied to the follow they change by lastFollower and
 * lastFollowing (see the rules). Those name an account, so once the count
 * has moved they're blanked, keeping who followed whom off public profiles.
 */
export function clearFollowMarkers(...uids) {
  for (const id of uids) {
    updateDoc(doc(db, "users", id), { lastFollower: "", lastFollowing: "" }).catch(() => {});
  }
}

// Most writes denormalise the author's name and photo, so the signed-in
// profile is held by a snapshot listener rather than read per write.
let own = null;

export function myProfile() {
  const uid = me();
  if (!uid) return Promise.resolve(null);
  if (own?.uid !== uid) {
    own?.stop();
    const entry = { uid, profile: undefined };
    entry.ready = new Promise((resolve) => {
      entry.stop = onSnapshot(doc(db, "users", uid), (snap) => {
        entry.profile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        resolve(entry.profile);
      }, () => {
        if (own === entry) own = null;
        resolve(null);
      });
    });
    own = entry;
  }
  return own.profile === undefined ? own.ready : Promise.resolve(own.profile);
}

// Bump on material policy changes. Profiles keep the version they accepted.
export const POLICY_VERSION = "2026-10-04.2";

export async function claimUsernameAndCreateProfile(user, username, birthYear, displayName) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid: user.uid });
  batch.set(ageRef(user.uid), { birthYear });
  batch.set(doc(db, "users", user.uid), {
    username,
    name: displayName || username,
    usernameChangedAt: null,
    // No email, phone or birth year: profiles are public.
    bio: "",
    pronouns: "",
    town: "",
    spouseUsername: "",
    photoURL: user.photoURL || "",
    followerCount: 0,
    followingCount: 0,
    createdAt: serverTimestamp(),
    // Server time, so consent can't be backdated.
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

const handleCache = new Map(); // handle -> uid | null
const handleOf = new Map(); // uid -> handle, for profiles read this session

function rememberHandle(profile) {
  if (profile?.username) {
    handleOf.set(profile.id, profile.username);
    handleCache.set(profile.username, profile.id);
  }
  return profile;
}

/** A profile's address: /@handle when the handle is known, else /u/<uid> (which then shows the handle). */
export function profilePath(uid) {
  const handle = handleOf.get(uid);
  return handle ? `/@${handle}` : `/u/${encodeURIComponent(uid)}`;
}

export function openUserProfile(uid) {
  if (!uid) return;
  if (uid === me()) navigate("/account");
  else navigate(profilePath(uid), { overlay: true });
}

/** uid for a handle already looked up: the uid, null (no such handle) or undefined (not looked up yet). */
export function cachedUidFor(username) {
  const handle = String(username || "").toLowerCase();
  return handleCache.has(handle) ? handleCache.get(handle) : undefined;
}

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

export async function removeAvatar() {
  const previous = (await myProfile().catch(() => null))?.photoURL;
  await updateDoc(doc(db, "users", me()), { photoURL: "" });
  await deleteInline(previous);
}

export async function uploadAvatar(file, onProgress) {
  const previous = (await myProfile().catch(() => null))?.photoURL;
  const { url } = await uploadMedia(file, onProgress, "avatars");
  await updateDoc(doc(db, "users", me()), { photoURL: url });
  await deleteInline(previous);
  return url;
}

// Private preferences (interests, hidden words, mutes) live in
// users/{uid}/private/prefs, readable only by the owner.

export async function fetchMyPrefs() {
  const snap = await getDoc(doc(db, "users", me(), "private", "prefs")).catch(() => null);
  return snap?.exists() ? snap.data() : { interests: [] };
}

export async function saveHiddenWords(words) {
  const clean = [...new Set(words.map((w) => w.trim().toLowerCase()).filter(Boolean))].slice(0, 200).map((w) => w.slice(0, 60));
  await setDoc(doc(db, "users", me(), "private", "prefs"), { hiddenWords: clean, updatedAt: serverTimestamp() }, { merge: true });
  return clean;
}

/** Accounts an admin has verified. */
export async function fetchVerified() {
  const snap = await getDocs(query(collection(db, "users"), where("badges", "array-contains", "verified"), limit(200)));
  return snapToList(snap);
}

/** Founder only (the rules check): gives the pink check to `uid`, taking it from whoever had it. */
export async function setPinkCheck(uid, on) {
  const reg = doc(db, "badges", "pink");
  const current = (await getDoc(reg)).data()?.uid || "";
  const batch = writeBatch(db);
  if (on) {
    if (current && current !== uid && (await getDoc(doc(db, "users", current))).exists()) {
      batch.update(doc(db, "users", current), { badges: arrayRemove("pink") });
    }
    batch.update(doc(db, "users", uid), { badges: arrayUnion("pink") });
    batch.set(reg, { uid, givenAt: serverTimestamp() });
  } else {
    batch.update(doc(db, "users", uid), { badges: arrayRemove("pink") });
    if (current === uid) batch.delete(reg);
  }
  await batch.commit();
}

/** Admins and moderators only (the rules check). */
export async function setBadge(uid, badge, on) {
  await updateDoc(doc(db, "users", uid), { badges: on ? arrayUnion(badge) : arrayRemove(badge) });
}

/** The first-run tour has been seen (or skipped) on this account. */
export async function setTourDone() {
  await setDoc(doc(db, "users", me(), "private", "prefs"), { tourDone: true, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setHideAi(on) {
  await setDoc(doc(db, "users", me(), "private", "prefs"), { hideAi: on, updatedAt: serverTimestamp() }, { merge: true });
}

/** Muting hides someone's content client-side. Unlike a block, it isn't enforced by the rules. */
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

export async function fetchMyFollowingSet() {
  const q = query(collection(db, "users", me(), "following"), limit(500));
  const set = new Set();
  (await getDocs(q)).docs.forEach((d) => set.add(d.id));
  return set;
}

export async function followsMe(uid) {
  const snap = await getDoc(doc(db, "users", uid, "following", me())).catch(() => null);
  return !!snap?.exists();
}

/** Follows (or requests, for a private account) or unfollows. Resolves to "following" | "requested" | "unfollowed". */
export async function toggleFollow(target, currentlyFollowing) {
  const uid = me();
  const followingRef = doc(db, "users", uid, "following", target.id);
  const followerRef = doc(db, "users", target.id, "followers", uid);
  if (currentlyFollowing) {
    const batch = writeBatch(db);
    batch.delete(followingRef);
    batch.delete(followerRef);
    // lastFollowing/lastFollower let the rules tie each count change to this write.
    batch.update(doc(db, "users", uid), { followingCount: increment(-1), lastFollowing: target.id });
    batch.update(doc(db, "users", target.id), { followerCount: increment(-1), lastFollower: uid });
    await batch.commit();
    clearFollowMarkers(uid, target.id);
    unnotify(target.id, "follow");
    return "unfollowed";
  }
  const full = target.isPrivate === undefined ? await fetchProfile(target.id) : target;
  if (full?.isPrivate) {
    await requestFollow(target);
    return "requested";
  }
  const mine = await myProfile();
  const batch = writeBatch(db);
  batch.set(followingRef, { username: full?.username || target.username || "", createdAt: serverTimestamp() });
  batch.set(followerRef, { username: mine?.username || "", createdAt: serverTimestamp() });
  batch.update(doc(db, "users", uid), { followingCount: increment(1), lastFollowing: target.id });
  batch.update(doc(db, "users", target.id), { followerCount: increment(1), lastFollower: uid });
  await batch.commit();
  clearFollowMarkers(uid, target.id);
  bumpAffinity(target.id, SIGNAL.follow).catch(() => {});
  notify(target.id, "follow");
  return "following";
}

export async function requestFollow(target) {
  const profile = await myProfile();
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

// The rules let the approver write both sides of the follow while the request exists.
export async function approveFollowRequest(request) {
  const uid = me();
  const [profile, requester] = await Promise.all([myProfile(), fetchProfile(request.id)]);
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "followers", request.id), { username: requester?.username || "", createdAt: serverTimestamp() });
  batch.set(doc(db, "users", request.id, "following", uid), { username: profile?.username || "", createdAt: serverTimestamp() });
  batch.update(doc(db, "users", uid), { followerCount: increment(1), lastFollower: request.id });
  batch.update(doc(db, "users", request.id), { followingCount: increment(1), lastFollowing: uid });
  batch.delete(doc(db, "users", uid, "followRequests", request.id));
  await batch.commit();
  clearFollowMarkers(uid, request.id);
  notify(request.id, "accept");
}

export async function declineFollowRequest(request) {
  await deleteDoc(doc(db, "users", me(), "followRequests", request.id));
}

// A block also drops follows in both directions; the rest is enforced by the rules.

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
    if (await batch.commit().then(() => true).catch(() => false)) clearFollowMarkers(uid, target.id);
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

export async function setPrivacySettings(fields) {
  await updateDoc(doc(db, "users", me()), fields);
}

/** Flips all of the user's non-circle posts between public and followers-only. */
export async function setPostsVisibility(to) {
  const from = to === "followers" ? "public" : "followers";
  const posts = (await fetchPostsByAuthor(me())).filter((p) => !p.groupId && p.visibility === from);
  let done = 0;
  for (let i = 0; i < posts.length; i += 400) {
    const chunk = posts.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((p) => batch.update(doc(db, "posts", p.id), { visibility: to }));
    await batch.commit().then(() => { done += chunk.length; }).catch(() => {});
  }
  return { done, total: posts.length };
}

export async function fetchFollowList(uid, kind /* 'followers' | 'following' */) {
  const q = query(collection(db, "users", uid, kind), limit(200));
  return snapToList(await getDocs(q));
}

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

// Spouse links

export async function sendSpouseRequest(targetProfile) {
  const uid = me();
  const mine = await myProfile();
  await addDoc(collection(db, "spouseRequests"), {
    fromUid: uid,
    fromUsername: mine?.username || "?",
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
