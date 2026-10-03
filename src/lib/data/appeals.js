// Appeals (appeals/{id}): someone whose words were blocked asks a person to
// look again. Staff uphold or overturn it and the author is told. Overturned
// text can then be posted by its author (lib/moderation allowOverturned).
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { allowOverturned } from "../moderation";
import { me, snapToList, tsMillis } from "./core.js";
import { myProfile } from "./users.js";
import { notify } from "./notifications.js";

export async function submitAppeal({ text, rule, where: place, note = "" }) {
  const profile = await myProfile();
  await addDoc(collection(db, "appeals"), {
    uid: me(),
    username: profile?.username || "",
    text: String(text).slice(0, 5000),
    rule,
    where: String(place || "post").slice(0, 40),
    note: note.trim().slice(0, 500),
    status: "open",
    createdAt: serverTimestamp(),
  });
}

export async function fetchMyAppeals() {
  if (!me()) return [];
  const snap = await getDocs(query(collection(db, "appeals"), where("uid", "==", me()), limit(100)));
  return snapToList(snap).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/** Lets this account post what it won on appeal. Called at sign-in. */
export async function loadAppealAllowances() {
  const mine = await fetchMyAppeals().catch(() => []);
  allowOverturned(mine.filter((a) => a.status === "overturned").map((a) => a.text));
}

/** Staff: the queue. */
export async function fetchAppeals(status = "open") {
  const snap = await getDocs(query(collection(db, "appeals"), where("status", "==", status), limit(200)));
  return snapToList(snap).sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
}

/** Staff: "upheld" keeps the block, "overturned" lets it post. The author is told either way. */
export async function decideAppeal(appeal, outcome, decision = "") {
  const profile = await myProfile();
  await updateDoc(doc(db, "appeals", appeal.id), {
    status: outcome,
    decision: decision.trim().slice(0, 500),
    reviewedBy: profile?.username || "",
    reviewedAt: serverTimestamp(),
  });
  await notify(appeal.uid, "appeal", { ref: appeal.id, text: outcome });
}
