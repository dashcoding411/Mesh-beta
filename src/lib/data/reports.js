// Reports, the moderation queue and suspensions.
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteCommentAndCount, hidePost } from "./posts.js";
import { myProfile } from "./users.js";

// One report per (reporter, target). Message and comment reports carry the
// exact text, checked by the rules, since moderators can't read chats.

export const REPORT_REASONS = [
  { id: "child_safety", label: "Child sexual abuse or exploitation", description: "Sexual content involving anyone under 18, or grooming" },
  { id: "hate", label: "Hate or discrimination", description: "Attacks people for their race, ethnicity, nationality, religion, caste, sexuality, gender or disability" },
  { id: "harassment", label: "Bullying or harassment", description: "Targets someone, piles on, or tells them to hurt themselves" },
  { id: "violence", label: "Violence, threats or gore", description: "Threatens harm, or shows death or injury to shock" },
  { id: "sexual", label: "Sexual content or nudity" },
  { id: "self_harm", label: "Self-harm or suicide", description: "Someone may be at risk" },
  { id: "spam", label: "Spam or scam" },
  { id: "fake", label: "Fake account or bot", description: "Run by a program, or one of many accounts working together" },
  { id: "misinfo", label: "False information" },
  { id: "impersonation", label: "Pretending to be someone else" },
  { id: "unlabelled_ai", label: "AI-generated, or an unlabelled AI edit", description: "Made entirely by AI (not allowed on Mesh), or edited with AI without the label" },
  { id: "other", label: "Something else" },
];

export const REPORT_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.id, r.label]));

// Reports from accounts older than a day needed to hold a post for review.
export const HOLD_AFTER_REPORTS = 3;

/** Held for review: three reports, or hidden by a moderator (or the image sweep). */
export function isHeld(post) {
  if (post?.modStatus === "hidden") return true;
  return (post?.reportCount || 0) >= HOLD_AFTER_REPORTS && post?.modStatus !== "cleared";
}

/** The content team: show a post behind a graphic content warning, or take it off. */
export async function setPostGraphic(postId, on) {
  await updateDoc(doc(db, "posts", postId), { graphic: !!on });
}

/** Admins: take a post out of feeds pending a decision, or put it back. */
export async function setPostHidden(postId, hidden) {
  await updateDoc(doc(db, "posts", postId), { modStatus: hidden ? "hidden" : "cleared" });
}

/** @param {{type: "post"|"comment"|"message"|"user", id: string, authorId: string, postId?: string, chatId?: string, text?: string}} target */
export async function reportContent(target, reason, details = "") {
  const uid = me();
  const id = `${target.type}_${target.id}_${uid}`;
  const report = {
    reporterId: uid,
    targetType: target.type,
    targetId: target.id,
    authorId: target.authorId,
    reason,
    details: String(details || "").slice(0, 500),
    status: "open",
    createdAt: serverTimestamp(),
    ...(target.postId ? { postId: target.postId } : {}),
    ...(target.chatId ? { chatId: target.chatId } : {}),
    ...(target.type === "comment" || target.type === "message" ? { excerpt: target.text || "" } : {}),
  };
  const reportRef = doc(db, "reports", id);
  // Reports are unreadable to reporters, so a duplicate surfaces as permission-denied.
  const plain = () => setDoc(reportRef, report).then(() => ({ duplicate: false }), (err) => {
    if (err?.code === "permission-denied") return { duplicate: true };
    throw err;
  });
  if (target.type !== "post") return plain();
  // Only accounts older than a day increment reportCount.
  const batch = writeBatch(db);
  batch.set(reportRef, report);
  batch.update(doc(db, "posts", target.id), { reportCount: increment(1) });
  try { await batch.commit(); return { duplicate: false }; }
  catch (err) {
    if (err?.code !== "permission-denied") throw err;
    return plain();
  }
}

export async function reportPost(post, reason, details = "") {
  const res = await reportContent({ type: "post", id: post.id, authorId: post.authorId }, reason, details);
  await hidePost(post, "reported").catch(() => {});
  return res;
}

// Which report types each team handles (firestore.rules, canHandleReport).
// Fake-account reports go to the accounts team whatever they're on.
export const REPORT_TEAM = { post: "content", comment: "content", message: "accounts", user: "accounts" };

/** Reports with `status`; `types` limits them to some kinds (a team's), or null for all (admins). */
export async function fetchReports(status = "open", types = null) {
  const q = types
    ? query(collection(db, "reports"), where("status", "==", status), where("targetType", "in", types), limit(300))
    : query(collection(db, "reports"), where("status", "==", status), limit(300));
  // The accounts team also takes fake-account reports made on posts and comments.
  const fakes = types?.includes("user")
    ? await getDocs(query(collection(db, "reports"), where("status", "==", status), where("reason", "==", "fake"), limit(300))).then(snapToList, () => [])
    : [];
  const seen = new Set();
  return [...snapToList(await getDocs(q)), ...fakes]
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    // Legacy reports predate `type` and were always posts.
    .map((r) => (r.targetType ? r : { ...r, targetType: "post", targetId: r.postId }))
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function resolveReports(reports, status, action = "") {
  const profile = await myProfile();
  const batch = writeBatch(db);
  for (const r of reports) {
    batch.update(doc(db, "reports", r.id), {
      status, action, reviewedBy: profile?.username || "", reviewedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function clearPost(postId) {
  await updateDoc(doc(db, "posts", postId), { modStatus: "cleared" });
}

/** Adds the "Edited with AI" label (and clears any hold) instead of removing the post. */
export async function labelPostAi(postId) {
  await updateDoc(doc(db, "posts", postId), { aiGenerated: true, modStatus: "cleared" });
}

export async function removeComment(postId, commentId) {
  await deleteCommentAndCount(postId, commentId);
}

export async function removeMessage(chatId, messageId) {
  await deleteDoc(doc(db, "chats", chatId, "messages", messageId));
}

export const SUSPENSION_LENGTHS = [
  { id: "1", days: 1, label: "1 day" },
  { id: "7", days: 7, label: "7 days" },
  { id: "30", days: 30, label: "30 days" },
  { id: "forever", days: null, label: "Permanently" },
];

// Suspensions are kept in suspensions/{uid}, which only the person and staff
// can read, so a suspension (or a lifted one) never shows on a public profile.
export async function suspendUser(uid, days, reason) {
  const until = days ? Timestamp.fromMillis(Date.now() + days * 86_400_000) : Timestamp.fromDate(new Date("9999-12-31"));
  const profile = await myProfile();
  await setDoc(doc(db, "suspensions", uid), { until, reason, by: profile?.username || "", createdAt: serverTimestamp() });
}

export async function liftSuspension(uid) {
  await deleteDoc(doc(db, "suspensions", uid));
}

/** Whether a suspension record (from fetchMySuspension) is still in force. */
export function isSuspended(suspension) {
  return tsMillis(suspension?.until) > Date.now();
}

export async function fetchSuspensions() {
  const snap = await getDocs(query(collection(db, "suspensions"), limit(200)));
  return snapToList(snap).filter((s) => tsMillis(s.until) > Date.now());
}

export async function fetchMySuspension() {
  const snap = await getDoc(doc(db, "suspensions", me())).catch(() => null);
  return snap?.exists() ? snap.data() : null;
}
