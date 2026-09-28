// Circles: communities, their rules and limits, members and join requests.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deletePost, fetchGroupPosts, fetchPendingPosts } from "./posts.js";
import { fetchProfile } from "./users.js";

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

export async function createGroup({ name, description, privacy = "public", ageLimit = 0, interests = [] }) {
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

export async function setCircleInterests(groupId, interests) {
  await updateDoc(doc(db, "groups", groupId), { interests: interests.slice(0, 3) });
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

// Membership and the member count change together; `lastMember` names who
// joined or left so the rules can check the count moved because of them.
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

// Admins promote and demote; only the owner can hand out moderator status.
export async function setMemberRole(groupId, uid, role) {
  await updateDoc(doc(db, "groups", groupId, "members", uid), { role });
}

export async function removeMember(groupId, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", groupId, "members", uid));
  batch.update(doc(db, "groups", groupId), { memberCount: increment(-1), lastMember: uid });
  await batch.commit();
}

/* Delete a circle you own: its posts, its join requests and memberships,
   then the circle. In that order, because removing other members is checked
   against the circle's owner, so the circle has to still exist. */
export async function deleteGroup(group) {
  const uid = me();
  const [posts, pending, requests, members] = await Promise.all([
    fetchGroupPosts(group, { member: true }).catch(() => []),
    fetchPendingPosts(group.id).catch(() => []),
    fetchJoinRequests(group.id).catch(() => []),
    fetchMembers(group.id).catch(() => []),
  ]);
  for (const p of [...posts, ...pending]) await deletePost(p).catch(() => {});
  for (const r of requests) await deleteDoc(doc(db, "groups", group.id, "joinRequests", r.id)).catch(() => {});
  for (const m of members) if (m.id !== uid) await deleteDoc(doc(db, "groups", group.id, "members", m.id)).catch(() => {});
  await deleteDoc(doc(db, "groups", group.id));
  await deleteDoc(doc(db, "groups", group.id, "members", uid)).catch(() => {});
}

export function canModerate(membership, group) {
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "moderator" || group?.ownerId === me();
}
