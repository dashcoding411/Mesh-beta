// Journalist applications (Settings > Become a journalist). Private to the
// applicant and the news team (firestore.rules). Proof photos are kept as
// small images in proof/{1-3} until the news team decides; then they and the
// CV details are deleted, so only the outcome stays.
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { compressImage } from "../media";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchProfile } from "./users.js";
import { notify } from "./notifications.js";

export const MAX_PROOF = 3;
export const MAX_LINKS = 5;
// A declined applicant can apply again after this long (the rules agree).
export const REAPPLY_DAYS = 30;

const appRef = (uid) => doc(db, "journalistApplications", uid);
const proofRef = (uid, n) => doc(db, "journalistApplications", uid, "proof", String(n));

export async function fetchMyApplication() {
  if (!me()) return null;
  const snap = await getDoc(appRef(me())).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** When a declined applicant can apply again (ms), or 0 if they can now. */
export function reapplyAt(app) {
  if (app?.status !== "declined") return 0;
  const at = tsMillis(app.decidedAt) + REAPPLY_DAYS * 86400000;
  return at > Date.now() ? at : 0;
}

const httpsLink = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return url.replace(/^http:/i, "https:").slice(0, 300);
};

/**
 * Sends (or replaces) your application, with up to three proof photos.
 * `keepProof` (how many were sent before) keeps them when no new ones are given.
 */
export async function submitApplication(fields, proofFiles = [], { keepProof = 0 } = {}) {
  const uid = me();
  const proofs = [];
  for (const file of proofFiles.slice(0, MAX_PROOF)) {
    proofs.push((await compressImage(file, { maxSide: 1600 })).data);
  }
  const batch = writeBatch(db);
  batch.set(appRef(uid), {
    name: fields.name.trim().slice(0, 80),
    outlet: (fields.outlet || "").trim().slice(0, 80),
    region: (fields.region || "").trim().slice(0, 60),
    experience: fields.experience.trim().slice(0, 3000),
    skills: (fields.skills || "").trim().slice(0, 600),
    qualification: (fields.qualification || "").trim().slice(0, 200),
    links: (fields.links || []).map(httpsLink).filter(Boolean).slice(0, MAX_LINKS),
    proofCount: proofs.length || keepProof,
    declaration: true,
    status: "pending",
    submittedAt: serverTimestamp(),
  });
  if (proofs.length || !keepProof) {
    for (let n = 1; n <= MAX_PROOF; n++) {
      if (proofs[n - 1]) batch.set(proofRef(uid, n), { data: proofs[n - 1] });
      else batch.delete(proofRef(uid, n));
    }
  }
  await batch.commit();
}

/** Withdraws a pending application, proof and all. */
export async function withdrawApplication() {
  const uid = me();
  const batch = writeBatch(db);
  for (let n = 1; n <= MAX_PROOF; n++) batch.delete(proofRef(uid, n));
  batch.delete(appRef(uid));
  await batch.commit();
}

// The news team

export async function fetchApplications() {
  const snap = await getDocs(query(collection(db, "journalistApplications"), where("status", "==", "pending"), limit(100)));
  return snapToList(snap).sort((a, b) => tsMillis(a.submittedAt) - tsMillis(b.submittedAt));
}

export async function fetchApplicationProof(uid) {
  const snap = await getDocs(collection(db, "journalistApplications", uid, "proof"));
  return snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data().data);
}

/**
 * Approves or declines. A yes makes them a journalist in the same write
 * (with how they were checked, kept privately) and fills in their byline; a
 * no can carry a short reason. Either way the CV details and proof are
 * deleted, and they're told.
 */
export async function decideApplication(app, { approve, method = "id document", evidence = "", note = "" }) {
  const uid = app.id;
  const batch = writeBatch(db);
  for (let n = 1; n <= MAX_PROOF; n++) batch.delete(proofRef(uid, n));
  if (approve) {
    const p = await fetchProfile(uid);
    batch.set(doc(db, "journalistChecks", uid), {
      identity: true,
      method,
      evidence: evidence.trim().slice(0, 500),
      outlet: (app.outlet || "").slice(0, 80),
      checkedBy: me(),
      checkedAt: serverTimestamp(),
    });
    batch.set(doc(db, "newsWriters", uid), { username: p.username, addedAt: serverTimestamp() });
  }
  const status = approve ? "approved" : "declined";
  batch.set(appRef(uid), { name: app.name, status, note: note.trim().slice(0, 300), decidedBy: me(), decidedAt: serverTimestamp() });
  await batch.commit();
  if (approve && (app.outlet || app.region)) {
    await setDoc(doc(db, "newsWriters", uid), { outlet: app.outlet || "", region: app.region || "", updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }
  await notify(uid, "journalist", { ref: uid, text: status });
}
