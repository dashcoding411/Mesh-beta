// Circles: settings, membership, moderation, guides and badges.
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteInline, deletePost, fetchGroupPosts, fetchPendingPosts } from "./posts.js";
import { uploadMedia } from "./uploads.js";
import { fetchProfile, myProfile } from "./users.js";
import { notify } from "./notifications.js";
import { createGroupChat } from "./chats.js";

// privacy: "public" (listed, readable), "private" (listed, members read),
// "hidden" (unlisted, invite link only).

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
  const q = query(collection(db, "groups"), where("privacy", "in", ["public", "private"]), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function fetchGroupById(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createGroup({ name, description, privacy = "public", ageLimit = 0, interests = [] }) {
  const uid = me();
  const profile = await myProfile();
  const group = {
    name,
    description,
    privacy,
    ownerId: uid,
    memberCount: 1,
    requireApproval: privacy !== "public",
    ageLimit,
    interests: interests.slice(0, 3),
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

// Mirrored in firestore.rules (circlePostOkAs). Admins and moderators are
// exempt from posting limits but not from banned words.
export const AUTOMOD_DEFAULTS = {
  postingPermission: "members", // "members" | "admins": who can start a post
  requirePostApproval: false,   // members' posts wait for an admin or moderator
  bannedWords: [],              // single words, stored lowercase
  // Admin Assist: each condition either declines a post or holds it for review.
  linkAction: "allow",          // "allow" | "hold" | "block"
  newAccountDays: 0,            // 0, 7, 30, 90 or 180
  newAccountAction: "decline",  // "decline" | "hold"
  holdNoPhoto: false,           // hold posts from accounts with no profile photo
  blockContactInfo: false,      // decline phone numbers, emails and card numbers
  minLength: 0,                 // decline Strands shorter than this (0, 10, 20, 50)
  mediaAllowed: true,           // false: Strands only, no photos or videos
  declineRecentStrikes: false,  // decline posts from anyone with a post removed in 28 days
  slowModeMinutes: 0,           // members wait this long between posts (0, 5, 15, 60)
};

/** Admin Assist settings, including legacy fields. */
export function effectiveAutomod(group) {
  const a = { ...AUTOMOD_DEFAULTS, ...(group?.automod || {}) };
  if (!group?.automod?.linkAction && group?.automod?.blockLinks) a.linkAction = "block";
  if (!group?.automod?.newAccountDays && group?.automod?.blockNewAccounts) a.newAccountDays = 7;
  return a;
}

// Must match the contact-detail patterns in firestore.rules: emails, or 10+
// digits with up to two separators between each (phones, card numbers).
export const CONTACT_INFO = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z0-9.-]*[a-z]{2,}|\+?(\d[ ().-]{0,2}){9,}\d/i;
const LINK = /https?:\/\/|www\./i;

export const AGE_LIMITS = [
  { id: 0, label: "Everyone", blurb: "Anyone with a Mesh account can join." },
  { id: 16, label: "16 and over", blurb: "Members must be 16 or older." },
  { id: 18, label: "18 and over", blurb: "Members must be 18 or older." },
];

export function isCircleMod(membership) {
  return membership?.role === "owner" || membership?.role === "moderator";
}

export function meetsAgeLimit(limitYears, profile) {
  if (!limitYears) return true;
  const y = profile?.birthYear || 0;
  return y > 0 && new Date().getFullYear() - y >= limitYears;
}

/** Mirrors the members create rule. */
export function canJoinDirectly(group) {
  return group.privacy === "public" && !group.requireApproval && !(group.screeningQuestions || []).length;
}

export function circleVisibility(group) {
  return group.privacy === "public" ? "public" : "circle";
}

export async function setCircleInterests(groupId, interests) {
  await updateDoc(doc(db, "groups", groupId), { interests: interests.slice(0, 3) });
}

/** Sets or clears (file = null) a circle's banner or photo. */
export async function setCircleImage(group, field, file) {
  if (!["bannerUrl", "photoUrl"].includes(field)) throw new Error("Unknown image");
  const url = file ? (await uploadMedia(file, undefined, field === "photoUrl" ? "avatars" : "uploads")).url : "";
  await updateDoc(doc(db, "groups", group.id), { [field]: url });
  if (group[field] && group[field] !== url) deleteInline(group[field]).catch(() => {});
  return url;
}

export async function setCircleCover(groupId, coverColor) {
  if (!COVER_COLORS.includes(coverColor)) throw new Error("Unknown cover");
  await updateDoc(doc(db, "groups", groupId), { coverColor });
}

export async function setCircleRules(groupId, rules) {
  await updateDoc(doc(db, "groups", groupId), { rules });
}

export async function setScreeningQuestions(groupId, questions) {
  await updateDoc(doc(db, "groups", groupId), { screeningQuestions: questions.slice(0, 3) });
}

function normaliseAutomod(a) {
  const words = (a.bannedWords || [])
    .map((w) => String(w).toLowerCase().trim())
    .filter(Boolean);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    postingPermission: a.postingPermission === "admins" ? "admins" : "members",
    requirePostApproval: !!a.requirePostApproval,
    bannedWords: [...new Set(words)].slice(0, 40),
    linkAction: pick(a.linkAction, ["allow", "hold", "block"], "allow"),
    newAccountDays: pick(Number(a.newAccountDays), [0, 7, 30, 90, 180], 0),
    newAccountAction: pick(a.newAccountAction, ["decline", "hold"], "decline"),
    holdNoPhoto: !!a.holdNoPhoto,
    blockContactInfo: !!a.blockContactInfo,
    minLength: pick(Number(a.minLength), [0, 10, 20, 50], 0),
    mediaAllowed: a.mediaAllowed !== false,
    declineRecentStrikes: !!a.declineRecentStrikes,
    slowModeMinutes: pick(Number(a.slowModeMinutes), [0, 5, 15, 60], 0),
  };
}

export async function setCircleLimits(groupId, { requireApproval, ageLimit, automod }) {
  await updateDoc(doc(db, "groups", groupId), {
    requireApproval: !!requireApproval,
    ageLimit: [0, 16, 18].includes(ageLimit) ? ageLimit : 0,
    automod: normaliseAutomod(automod),
  });
}

const youngAccount = (profile, days) => {
  if (!days) return false;
  const age = Date.now() - tsMillis(profile?.createdAt);
  return age >= 0 && age < days * 86400000;
};

// Client-side mirror of circlePostOkAs. Returns a user-facing reason, or null.
export function screenPost(text, group, profile, membership, { kind = "text" } = {}) {
  const automod = effectiveAutomod(group);
  const body = String(text || "").toLowerCase();
  const mod = isCircleMod(membership);

  if (!membership) return "Join this circle to post in it.";
  if (isMuted(membership)) return "You're muted in this circle for now.";
  if (automod.postingPermission === "admins" && !mod) {
    return "Only admins and moderators can post in this circle.";
  }
  const words = new Set(body.split(/[^a-z0-9]+/).filter(Boolean));
  const hit = (automod.bannedWords || []).find((w) => w && (words.has(w.toLowerCase()) || body.includes(w.toLowerCase())));
  if (hit) return `This circle blocks the word "${hit}".`;
  if (mod) return null;

  if (automod.linkAction === "block" && LINK.test(body)) return "This circle doesn't allow links in posts.";
  if (automod.newAccountAction === "decline" && youngAccount(profile, automod.newAccountDays)) {
    return `This circle takes posts from accounts at least ${automod.newAccountDays} days old.`;
  }
  if (automod.blockContactInfo && CONTACT_INFO.test(body)) {
    return "This circle keeps phone numbers, email addresses and card numbers out of posts. Share them in a private message instead.";
  }
  if (kind === "text" && automod.minLength && String(text || "").trim().length < automod.minLength) {
    return `Posts here need at least ${automod.minLength} characters. Say a little more.`;
  }
  if (!automod.mediaAllowed && kind !== "text") return "This circle takes words only: no photos or videos.";
  if (automod.declineRecentStrikes && Date.now() - tsMillis(membership.lastStrikeAt) < 28 * 86400000) {
    return "An admin removed one of your posts here in the last 28 days, so you can't post for now.";
  }
  if (automod.slowModeMinutes) {
    const wait = tsMillis(membership.lastPostAt) + automod.slowModeMinutes * 60000 - Date.now();
    if (wait > 0) return `Slow mode is on. You can post again in ${Math.ceil(wait / 60000)} minute${wait > 60000 ? "s" : ""}.`;
  }
  return null;
}

export function circlePostVisibility(group, membership, { text = "", profile } = {}) {
  const automod = effectiveAutomod(group);
  if (isCircleMod(membership)) return circleVisibility(group);
  const hold = automod.requirePostApproval
    || (automod.linkAction === "hold" && LINK.test(text))
    || (automod.newAccountAction === "hold" && youngAccount(profile, automod.newAccountDays))
    || (automod.holdNoPhoto && !profile?.photoURL);
  return hold ? "pending" : circleVisibility(group);
}

// Join requests

export async function requestToJoin(groupId, answers) {
  const uid = me();
  const profile = await myProfile();
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

// lastMember lets the rules tie the count change to this membership.
export async function approveJoinRequest(groupId, request) {
  const who = await fetchProfile(request.uid).catch(() => null);
  const batch = writeBatch(db);
  batch.set(doc(db, "groups", groupId, "members", request.uid), {
    uid: request.uid,
    username: who?.username || request.username || "",
    role: "member",
    joinedAt: serverTimestamp(),
  });
  batch.delete(doc(db, "groups", groupId, "joinRequests", request.uid));
  batch.update(doc(db, "groups", groupId), { memberCount: increment(1), lastMember: request.uid });
  await batch.commit();
  notify(request.uid, "joined", { ref: groupId });
}

export async function declineJoinRequest(groupId, uid) {
  await deleteDoc(doc(db, "groups", groupId, "joinRequests", uid));
}

export async function myJoinRequest(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId, "joinRequests", me()));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Featured posts, topics and penalties

export function featuredIds(group) {
  if (group?.featuredPostIds?.length) return group.featuredPostIds;
  return group?.pinnedPostId ? [group.pinnedPostId] : [];
}

export async function setFeaturedPosts(groupId, ids) {
  await updateDoc(doc(db, "groups", groupId), { featuredPostIds: ids.slice(0, 3), pinnedPostId: "" });
}

export async function setCircleTopics(groupId, topics) {
  const clean = [...new Set(topics.map((t) => t.trim()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 30));
  await updateDoc(doc(db, "groups", groupId), { topics: clean });
  return clean;
}

/** Records a strike against the author (counts for 28 days). */
export async function addStrike(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId, "members", uid), { strikes: increment(1), lastStrikeAt: serverTimestamp() }).catch(() => {});
}

// Community chat

export async function createCircleChat(group) {
  const { id } = await createGroupChat(`${group.name}`.slice(0, 60), [], { circleId: group.id });
  await updateDoc(doc(db, "groups", group.id), { chatId: id });
  return id;
}

export async function joinCircleChat(group) {
  const profile = await myProfile();
  await updateDoc(doc(db, "chats", group.chatId), {
    members: arrayUnion(me()),
    [`memberNames.${me()}`]: profile?.username || "?",
  });
}

// Guides

export async function fetchGuides(groupId) {
  const snap = await getDocs(query(collection(db, "groups", groupId, "guides"), orderBy("createdAt", "asc"), limit(20)));
  return snapToList(snap);
}

export async function saveGuide(groupId, guide) {
  const data = {
    title: guide.title.trim().slice(0, 100),
    unitTitles: guide.units.map((u) => u.title.trim().slice(0, 100)),
    unitBodies: guide.units.map((u) => u.body.trim().slice(0, 2000)),
    updatedAt: serverTimestamp(),
  };
  if (guide.id) {
    await updateDoc(doc(db, "groups", groupId, "guides", guide.id), { ...data, createdBy: guide.createdBy, createdAt: guide.createdAt });
    return guide.id;
  }
  const ref_ = await addDoc(collection(db, "groups", groupId, "guides"), { ...data, createdBy: me(), createdAt: serverTimestamp() });
  return ref_.id;
}

export async function deleteGuide(groupId, guideId) {
  await deleteDoc(doc(db, "groups", groupId, "guides", guideId));
}

export async function fetchGuideProgress(groupId, guideId) {
  const snap = await getDoc(doc(db, "groups", groupId, "guides", guideId, "progress", me())).catch(() => null);
  return snap?.exists() ? snap.data().done || [] : [];
}

export async function setGuideProgress(groupId, guideId, done) {
  await setDoc(doc(db, "groups", groupId, "guides", guideId, "progress", me()), { done: [...new Set(done)].slice(0, 20), updatedAt: serverTimestamp() });
}

export async function fetchGuideCompletions(groupId, guide) {
  const snap = await getDocs(query(collection(db, "groups", groupId, "guides", guide.id, "progress"), limit(500))).catch(() => null);
  if (!snap) return null;
  const total = guide.unitTitles.length;
  return { started: snap.size, finished: snap.docs.filter((d) => (d.data().done || []).length >= total).length };
}

export async function setPostLocked(postId, locked) {
  await updateDoc(doc(db, "posts", postId), { locked });
}

// Penalties escalate: timed mute, then post approval, then removal.
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

// Contributor badges

export function contributorBadge(member, postCount) {
  if (member?.role === "owner") return { label: "Admin", tone: "violet" };
  if (member?.role === "moderator") return { label: "Mod", tone: "sky" };
  if (postCount >= 20) return { label: "Top contributor", tone: "amber" };
  if (postCount >= 5) return { label: "Regular", tone: "emerald" };
  const joined = tsMillis(member?.joinedAt);
  if (joined && Date.now() - joined < 7 * 86400000) return { label: "New here", tone: "zinc" };
  return null;
}

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
  const profile = await myProfile();
  const batch = writeBatch(db);
  batch.set(doc(db, "groups", groupId, "members", uid), {
    uid,
    username: profile?.username || "",
    role: "member",
    joinedAt: serverTimestamp(),
  });
  batch.update(doc(db, "groups", groupId), { memberCount: increment(1), lastMember: uid });
  await batch.commit();
}

export async function leaveGroup(groupId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", groupId, "members", me()));
  batch.update(doc(db, "groups", groupId), { memberCount: increment(-1), lastMember: me() });
  await batch.commit();
}

// Only the owner can grant moderator.
export async function setMemberRole(groupId, uid, role) {
  await updateDoc(doc(db, "groups", groupId, "members", uid), { role });
}

export async function removeMember(groupId, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", groupId, "members", uid));
  batch.update(doc(db, "groups", groupId), { memberCount: increment(-1), lastMember: uid });
  await batch.commit();
}

// Order matters: member deletes are authorised against the circle's owner,
// so the circle doc goes last.
export async function deleteGroup(group) {
  const uid = me();
  // Abort if posts can't be listed (e.g. brick mode) rather than orphan them.
  const [posts, pending, requests, members] = await Promise.all([
    fetchGroupPosts(group, { member: true }),
    fetchPendingPosts(group.id).catch(() => []),
    fetchJoinRequests(group.id).catch(() => []),
    fetchMembers(group.id).catch(() => []),
  ]);
  for (const p of [...posts, ...pending]) await deletePost(p).catch(() => {});
  for (const r of requests) await deleteDoc(doc(db, "groups", group.id, "joinRequests", r.id)).catch(() => {});
  // Guides before memberships, while the caller still counts as an admin.
  for (const g of await fetchGuides(group.id).catch(() => [])) {
    const progress = await getDocs(collection(db, "groups", group.id, "guides", g.id, "progress")).catch(() => null);
    for (const d of progress?.docs || []) await deleteDoc(d.ref).catch(() => {});
    await deleteGuide(group.id, g.id).catch(() => {});
  }
  if (group.chatId) await deleteDoc(doc(db, "chats", group.chatId)).catch(() => {});
  for (const m of members) if (m.id !== uid) await deleteDoc(doc(db, "groups", group.id, "members", m.id)).catch(() => {});
  await deleteDoc(doc(db, "groups", group.id));
  await deleteDoc(doc(db, "groups", group.id, "members", uid)).catch(() => {});
  await Promise.all([deleteInline(group.bannerUrl), deleteInline(group.photoUrl)]).catch(() => {});
}

export function canModerate(membership, group) {
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "moderator" || group?.ownerId === me();
}
