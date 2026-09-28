// Reports, the moderation queue and suspensions.
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { deleteCommentAndCount, hidePost } from "./posts.js";
import { fetchProfile } from "./users.js";

// ---------- reports and moderation ----------
// Anything someone else wrote can be reported: posts, comments, messages and
// accounts. One report per person per thing. A reported message or comment
// carries its exact text (the rules check it matches), because moderators
// can't open private conversations.

export const REPORT_REASONS = [
  { id: "hate", label: "Hate or discrimination", description: "Attacks people for their race, ethnicity, nationality, religion, caste, sexuality, gender or disability" },
  { id: "harassment", label: "Bullying or harassment", description: "Targets someone, piles on, or tells them to hurt themselves" },
  { id: "violence", label: "Violence or threats", description: "Threatens or encourages harm" },
  { id: "sexual", label: "Sexual content or nudity" },
  { id: "self_harm", label: "Self-harm or suicide", description: "Someone may be at risk" },
  { id: "spam", label: "Spam or scam" },
  { id: "misinfo", label: "False information" },
  { id: "impersonation", label: "Pretending to be someone else" },
  { id: "other", label: "Something else" },
];

export const REPORT_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.id, r.label]));

/** A post reported by this many established accounts leaves feeds until reviewed. */
export const HOLD_AFTER_REPORTS = 3;

export function isHeld(post) {
  return (post?.reportCount || 0) >= HOLD_AFTER_REPORTS && post?.modStatus !== "cleared";
}

/**
 * target: { type: "post" | "comment" | "message" | "user", id, authorId,
 *           postId?, chatId?, text? }
 */
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
  // Only moderators can read reports, so a repeat shows up as a refused
  // write (the report already exists and can't be overwritten).
  const plain = () => setDoc(reportRef, report).then(() => ({ duplicate: false }), (err) => {
    if (err?.code === "permission-denied") return { duplicate: true };
    throw err;
  });
  if (target.type !== "post") return plain();
  // The report and the post's count go together. Accounts under a day old
  // can report, but their report doesn't count towards holding the post.
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

/** Moderators: open reports, newest first. */
export async function fetchReports(status = "open") {
  const q = query(collection(db, "reports"), where("status", "==", status), limit(300));
  return snapToList(await getDocs(q))
    // Reports made before targets had types were always about posts.
    .map((r) => (r.targetType ? r : { ...r, targetType: "post", targetId: r.postId }))
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export async function resolveReports(reports, status, action = "") {
  const profile = await fetchProfile(me());
  const batch = writeBatch(db);
  for (const r of reports) {
    batch.update(doc(db, "reports", r.id), {
      status, action, reviewedBy: profile?.username || "", reviewedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Keep a reported post up, and stop reports from holding it back again. */
export async function clearPost(postId) {
  await updateDoc(doc(db, "posts", postId), { modStatus: "cleared" });
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

export async function suspendUser(uid, days, reason) {
  const until = days ? Timestamp.fromMillis(Date.now() + days * 86_400_000) : Timestamp.fromDate(new Date("9999-12-31"));
  const profile = await fetchProfile(me());
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), { suspendedUntil: until });
  batch.set(doc(db, "suspensions", uid), { until, reason, by: profile?.username || "", createdAt: serverTimestamp() });
  await batch.commit();
}

export async function liftSuspension(uid) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), { suspendedUntil: Timestamp.fromMillis(0) });
  batch.delete(doc(db, "suspensions", uid));
  await batch.commit();
}

export function isSuspended(profile) {
  return tsMillis(profile?.suspendedUntil) > Date.now();
}

export async function fetchSuspensions() {
  const snap = await getDocs(query(collection(db, "suspensions"), limit(200)));
  return snapToList(snap).filter((s) => tsMillis(s.until) > Date.now());
}

export async function fetchMySuspension() {
  const snap = await getDoc(doc(db, "suspensions", me())).catch(() => null);
  return snap?.exists() ? snap.data() : null;
}
