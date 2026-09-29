// Brick mode's reads and writes. The logic (what's stricter, what's locked)
// is in ../brick.js; the security rules check every write here the same way.

import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { fetchProfile, uidForUsername } from "./users.js";
import { notify } from "./notifications.js";
import {
  COOL_OFF_MS, applyChange, carryTightening, dayKey, deviceOffset, deviceZone, emptyLayer, isTighterOrSame, layerToDoc, policyFromDoc, tightest,
} from "../brick.js";

const lockRef = (uid) => doc(db, "locks", uid);

/** Your limits (or a linked teen's), live. `onChange(policy | null, raw)`. */
export function listenLock(uid, onChange) {
  // A change just saved has no server time yet; use the estimate rather
  // than reading it as "the start of time" (which would look long overdue).
  return onSnapshot(lockRef(uid),
    (snap) => onChange(snap.exists() ? policyFromDoc(snap.data({ serverTimestamps: "estimate" })) : null, snap.exists() ? snap.data() : null),
    () => onChange(null, null));
}

/** Today's minutes per section, live. */
export function listenUsage(uid, offset, onChange) {
  return onSnapshot(doc(db, "usage", `${uid}_${dayKey(Date.now(), offset)}`),
    (snap) => onChange(snap.exists() ? snap.data() : {}), () => onChange({}));
}

/* Your own limits. Anything at least as strict applies at once. Anything
   looser is split: the stricter parts apply now, and the full change waits
   24 hours in `pending`, which you can cancel. Returns { applied } or
   { applied: false, dueAt }. */
export async function saveOwnLimits(policy, raw, next) {
  if (!policy) {
    await setDoc(lockRef(me()), {
      tzOffset: deviceOffset(),
      tzName: deviceZone().slice(0, 64),
      tzChangedAt: serverTimestamp(),
      self: layerToDoc(next),
      pending: null,
      parent: null,
      parentRequest: null,
      updatedAt: serverTimestamp(),
    });
    return { applied: true };
  }
  if (isTighterOrSame(next, policy.self)) {
    const changes = { self: layerToDoc(next), updatedAt: serverTimestamp() };
    // A waiting loosening mustn't undo what you just tightened.
    if (policy.pending) {
      changes.pending = { ...raw.pending, self: layerToDoc(carryTightening(policy.pending.self, policy.self, next)) };
    }
    await updateDoc(lockRef(me()), changes);
    return { applied: true };
  }
  // Added to anything already waiting, and the 24 hours start again.
  const target = policy.pending ? applyChange(policy.pending.self, policy.self, next) : next;
  await updateDoc(lockRef(me()), {
    self: layerToDoc(tightest(policy.self, next)),
    pending: { self: layerToDoc(target), requestedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
  return { applied: false, dueAt: Date.now() + COOL_OFF_MS };
}

export async function cancelPending() {
  await updateDoc(lockRef(me()), { pending: null, updatedAt: serverTimestamp() });
}

/** Once its 24 hours are up, the waiting change becomes your limits. */
export async function applyPending(raw) {
  const p = raw.pending;
  const changes = { self: p.self, pending: null, updatedAt: serverTimestamp() };
  if (typeof p.tzOffset === "number" && p.tzOffset !== raw.tzOffset) {
    changes.tzOffset = p.tzOffset;
    changes.tzName = p.tzName || "";
    changes.tzChangedAt = serverTimestamp();
  }
  await updateDoc(lockRef(me()), changes);
}

/** Brick now, until `untilMs`. Can't be ended early (that would be loosening). */
export async function brickUntil(policy, raw, untilMs) {
  const base = policy?.self || emptyLayer();
  return saveOwnLimits(policy, raw, { ...base, until: Math.max(base.until || 0, untilMs) });
}

/* Keeping local time right. A daylight-saving hour moves at once (the rules
   allow an hour at most every 20 days); moving further, to another country,
   waits 24 hours like any other change, since it shifts every window. */
export async function syncTimeZone(policy) {
  const offset = deviceOffset();
  if (!policy || offset === policy.tzOffset) return "same";
  if (Math.abs(offset - policy.tzOffset) <= 60 && Date.now() - policy.tzChangedAt > 20 * 86400000) {
    await updateDoc(lockRef(me()), { tzOffset: offset, tzName: deviceZone().slice(0, 64), tzChangedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return "updated";
  }
  return "needs-wait";
}

export async function requestTimeZoneChange(policy, raw) {
  await updateDoc(lockRef(me()), {
    pending: {
      self: raw.pending?.self || layerToDoc(policy.self),
      requestedAt: serverTimestamp(),
      tzOffset: deviceOffset(),
      tzName: deviceZone().slice(0, 64),
    },
    updatedAt: serverTimestamp(),
  });
}

// ---------- usage, for daily caps ----------

/** Add 30 seconds to today's count for a section. The rules allow one of
    these every 25 seconds, so two open tabs can't double-count. */
export async function pingUsage(policy, section, seconds = 30) {
  const id = `${me()}_${dayKey(Date.now(), policy.tzOffset || 0)}`;
  await setDoc(doc(db, "usage", id), { uid: me(), [section]: increment(seconds), at: serverTimestamp() }, { merge: true });
}

/** Earlier days aren't needed once they're over: keep a week, delete the rest. */
export async function tidyUsage(policy) {
  const today = `${me()}_${dayKey(Date.now(), policy.tzOffset || 0)}`;
  const week = new Set(Array.from({ length: 7 }, (_, i) => `${me()}_${dayKey(Date.now() - i * 86400000, policy.tzOffset || 0)}`));
  const docs = await getDocs(query(collection(db, "usage"), where("uid", "==", me()))).catch(() => null);
  if (!docs) return;
  const old = docs.docs.filter((d) => d.id !== today && !week.has(d.id));
  if (!old.length) return;
  const batch = writeBatch(db);
  old.slice(0, 400).forEach((d) => batch.delete(d.ref));
  await batch.commit().catch(() => {});
}

export async function fetchUsageFor(uid, offset) {
  const snap = await getDocs(query(collection(db, "usage"), where("uid", "==", uid))).catch(() => null);
  const today = `${uid}_${dayKey(Date.now(), offset)}`;
  return snap?.docs.find((d) => d.id === today)?.data() || {};
}

// ---------- family: a parent and an under-18 account ----------

export async function fetchMyFamilyLink() {
  const snap = await getDoc(doc(db, "familyLinks", me())).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchMyTeens() {
  return snapToList(await getDocs(query(collection(db, "familyLinks"), where("parentId", "==", me()))));
}

/** A parent asks to link a teen's account. The teen has to agree. */
export async function inviteTeen(handle) {
  const uid = await uidForUsername(handle);
  if (!uid) throw new Error("There's no account with that handle.");
  if (uid === me()) throw new Error("That's your own account.");
  const [mine, theirs] = await Promise.all([fetchProfile(me()), fetchProfile(uid)]);
  const thisYear = new Date().getFullYear();
  if (!(mine?.birthYear > 0) || thisYear - mine.birthYear < 19) throw new Error("Parental controls are for adults. Set your birth year in Settings first.");
  if (!(theirs?.birthYear > 0) || thisYear - theirs.birthYear >= 18) throw new Error(`@${theirs?.username || handle} isn't an under-18 account, so there's nothing to supervise.`);
  await setDoc(doc(db, "familyLinks", uid), {
    parentId: me(),
    parentName: mine.username,
    childName: theirs.username,
    status: "invited",
    createdAt: serverTimestamp(),
  });
  notify(uid, "family");
  return theirs;
}

export async function acceptFamilyInvite(link) {
  await updateDoc(doc(db, "familyLinks", me()), { status: "active" });
  notify(link.parentId, "familyok");
}

export async function declineFamilyInvite() {
  await deleteDoc(doc(db, "familyLinks", me()));
}

/** The parent ends supervision: their limits go with it. */
export async function removeFamilyLink(childUid) {
  // Limits first: once the link is gone, so is the right to change them.
  await updateDoc(lockRef(childUid), { parent: null, parentRequest: null, updatedAt: serverTimestamp() }).catch(() => {});
  await deleteDoc(doc(db, "familyLinks", childUid));
}

/** The parent sets their layer on a teen's account. Takes effect at once. */
export async function saveParentLimits(child, policy, layer) {
  const mine = await fetchProfile(me());
  const parent = { ...layerToDoc(layer), parentId: me(), parentName: mine.username, untilYear: child.birthYear + 18 };
  if (!policy) {
    await setDoc(lockRef(child.id), {
      tzOffset: deviceOffset(),
      tzName: deviceZone().slice(0, 64),
      tzChangedAt: serverTimestamp(),
      self: layerToDoc(emptyLayer()),
      pending: null,
      parent,
      parentRequest: null,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(lockRef(child.id), { parent, updatedAt: serverTimestamp() });
  }
}

/** The parent says yes (their layer becomes what was asked for) or no. */
export async function answerParentRequest(child, policy, approve) {
  const req = policy.parentRequest;
  if (approve && req.unlink) return removeFamilyLink(child.id);
  if (approve) {
    const mine = await fetchProfile(me());
    await updateDoc(lockRef(child.id), {
      parent: { ...layerToDoc(req.self), parentId: me(), parentName: mine.username, untilYear: child.birthYear + 18 },
      parentRequest: null,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(lockRef(child.id), { parentRequest: null, updatedAt: serverTimestamp() });
  }
}

/** The teen asks the parent to change (or end) the parent's limits. */
export async function requestParentChange(policy, target, note, unlink = false) {
  await updateDoc(lockRef(me()), {
    parentRequest: { self: layerToDoc(target), note: note.slice(0, 280), unlink, at: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
  if (policy.parent?.parentId) notify(policy.parent.parentId, "familyask", { text: note.slice(0, 140) });
}

export async function withdrawParentRequest() {
  await updateDoc(lockRef(me()), { parentRequest: null, updatedAt: serverTimestamp() });
}
