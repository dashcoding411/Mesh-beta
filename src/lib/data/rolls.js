// Rolls: a shared disposable camera. Everyone in a roll gets 27 shots, and
// nobody sees any photo (their own included) until it develops, at 9am by
// default. The rules hold the line: photos are unreadable before developAt,
// and each shot is tied to the shooter's count so 27 means 27.
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { myProfile } from "./users.js";
import { deleteCloudMedia, uploadRollShot } from "./uploads.js";
import { deleteInline } from "./posts.js";
import { assertSafe } from "../imageCheck";

export const SHOTS_PER_PERSON = 27;
export const MAX_MEMBERS = 50;
export const DEVELOP_HOUR = 9;
const HOUR = 3600000;
const DAY = 24 * HOUR;

const rollRef = (id) => doc(db, "rolls", id);

/** The next 9am at least `gapHours` after `fromMs`, in the device's time zone. */
export function nextDevelopAt(fromMs = Date.now(), gapHours = 4) {
  const earliest = fromMs + gapHours * HOUR;
  const d = new Date(earliest);
  d.setHours(DEVELOP_HOUR, 0, 0, 0);
  if (d.getTime() < earliest) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Choices for when a roll develops: the next morning, the two after, and a week on. */
export function developChoices(fromMs = Date.now()) {
  const first = nextDevelopAt(fromMs);
  const at = (days) => { const d = new Date(first); d.setDate(d.getDate() + days); return d.getTime(); };
  return [first, at(1), at(2), at(6)];
}

/** "tomorrow at 9am", "today at 9am", "Saturday at 9am", "Sat 17 Oct at 9am". */
export function developLabel(ms, now = Date.now()) {
  const d = new Date(ms);
  // "9am", "8:30pm": the way Australians write times.
  const h = d.getHours();
  const hour = `${h % 12 || 12}${d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  const day = (offset) => { const x = new Date(now); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + offset); return x.getTime(); };
  const start = new Date(ms).setHours(0, 0, 0, 0);
  if (start === day(0)) return `today at ${hour}`;
  if (start === day(1)) return `tomorrow at ${hour}`;
  if (start < day(7)) return `${d.toLocaleDateString(undefined, { weekday: "long" })} at ${hour}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} at ${hour}`;
}

/** "9h 12m", "42m", "under a minute". */
export function countdownLabel(ms, now = Date.now()) {
  const left = ms - now;
  if (left <= 60000) return "under a minute";
  const h = Math.floor(left / HOUR);
  const m = Math.floor((left % HOUR) / 60000);
  if (h >= 48) return `${Math.round(left / DAY)} days`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const isDeveloped = (roll, now = Date.now()) => !!roll && tsMillis(roll.developAt) <= now;
export const isMember = (roll, uid = me()) => !!roll && !!uid && (roll.members || []).includes(uid);
export const rollUrl = (id) => `${window.location.origin}/rolls/${encodeURIComponent(id)}`;

export async function createRoll({ title, developAt, gatheringId = "" }) {
  const profile = await myProfile();
  const ref_ = doc(collection(db, "rolls"));
  const roll = {
    title: title.trim().slice(0, 60),
    ownerId: me(),
    ownerName: profile?.username || "",
    gatheringId: gatheringId || "",
    members: [me()],
    open: true,
    photoCount: 0,
    developAt: Timestamp.fromMillis(developAt),
    createdAt: serverTimestamp(),
  };
  await setDoc(ref_, roll);
  return { id: ref_.id, ...roll, createdAt: Timestamp.now() };
}

export async function fetchRoll(id) {
  const snap = await getDoc(rollRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Rolls you're in, developing soonest first, then the most recently developed. */
export async function fetchMyRolls() {
  if (!me()) return [];
  const list = snapToList(await getDocs(query(collection(db, "rolls"), where("members", "array-contains", me()), limit(100))));
  const now = Date.now();
  const live = list.filter((r) => !isDeveloped(r, now)).sort((a, b) => tsMillis(a.developAt) - tsMillis(b.developAt));
  const done = list.filter((r) => isDeveloped(r, now)).sort((a, b) => tsMillis(b.developAt) - tsMillis(a.developAt));
  return [...live, ...done];
}

export async function joinRoll(roll) {
  await updateDoc(rollRef(roll.id), { members: arrayUnion(me()) });
}

export async function leaveRoll(roll) {
  await updateDoc(rollRef(roll.id), { members: arrayRemove(me()) });
}

/** Owner only. Their photos stay unless the owner deletes them. */
export async function removeFromRoll(roll, uid) {
  await updateDoc(rollRef(roll.id), { members: arrayRemove(uid) });
}

export async function updateRoll(roll, fields) {
  const allowed = {};
  if ("title" in fields) allowed.title = fields.title.trim().slice(0, 60);
  if ("open" in fields) allowed.open = !!fields.open;
  await updateDoc(rollRef(roll.id), allowed);
}

/** Whoever started it (or Mesh staff, for testing): shooting ends and everyone sees every photo now. */
export async function developRollNow(roll) {
  await updateDoc(rollRef(roll.id), { developAt: serverTimestamp() });
}

/** Owner only: the photos (theirs and everyone's), then the roll. */
export async function deleteRoll(roll) {
  const photos = await getDocs(query(collection(db, "rolls", roll.id, "photos"), limit(2000))).catch(() => null);
  for (const d of photos?.docs || []) {
    const p = d.data();
    await deleteDoc(d.ref).catch(() => {});
    if (p.authorId === me()) await removeImage(p.url);
  }
  const shots = await getDocs(query(collection(db, "rolls", roll.id, "shots"), limit(100))).catch(() => null);
  for (const d of shots?.docs || []) await deleteDoc(d.ref).catch(() => {});
  await deleteDoc(rollRef(roll.id));
}

/** How many of your 27 you've used. */
export async function fetchMyShotCount(rollId) {
  const snap = await getDoc(doc(db, "rolls", rollId, "shots", me())).catch(() => null);
  return snap?.exists() ? snap.data().count || 0 : 0;
}

/** Your own photos in a roll, for downloading your data and deleting your account. */
export async function fetchMyRollPhotos(rollId) {
  return snapToList(await getDocs(query(collection(db, "rolls", rollId, "photos"), where("authorId", "==", me()), limit(SHOTS_PER_PERSON))));
}

/** Every photo, in the order they were taken. Only after it develops (the rules). */
export async function fetchRollPhotos(rollId) {
  const q = query(collection(db, "rolls", rollId, "photos"), orderBy("createdAt", "asc"), limit(MAX_MEMBERS * SHOTS_PER_PERSON));
  return snapToList(await getDocs(q));
}

async function removeImage(url) {
  await deleteCloudMedia(url);
  await deleteInline(url).catch(() => {});
}

/** The photo's author, or the roll's owner. The image goes when its author removes it. */
export async function deleteRollPhoto(roll, photo) {
  await deleteDoc(doc(db, "rolls", roll.id, "photos", photo.id));
  if (photo.authorId === me()) await removeImage(photo.url);
}

// Shooting: shots are developed on the device, checked, uploaded and filed
// one at a time in the background, so the camera is ready again at once and
// leaving the camera doesn't lose anything still saving.

const queue = [];
let busy = false;
const listeners = new Set();
let state = { saving: 0, failed: 0, lastError: "" };
const emit = () => listeners.forEach((l) => l(state));

export function onShotQueue(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

async function fileShot({ roll, blob, width, height }) {
  const file = new File([blob], `roll-${Date.now()}.jpg`, { type: "image/jpeg" });
  await assertSafe(file);
  const { url } = await uploadRollShot(file);
  const profile = await myProfile();
  const photoRef = doc(collection(db, "rolls", roll.id, "photos"));
  const batch = writeBatch(db);
  batch.set(photoRef, { authorId: me(), authorName: profile?.username || "", url, width, height, createdAt: serverTimestamp() });
  batch.set(doc(db, "rolls", roll.id, "shots", me()), { count: increment(1), last: photoRef.id }, { merge: true });
  batch.update(rollRef(roll.id), { photoCount: increment(1) });
  try { await batch.commit(); }
  catch (err) { await removeImage(url); throw err; }
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    try { await fileShot(job); }
    catch (err) {
      state = { ...state, failed: state.failed + 1, lastError: err?.name === "UnsafeImageError" ? err.message : err?.code === "permission-denied"
        ? "That shot wasn't saved: the roll may have developed, or you're out of shots."
        : "A shot didn't save. Check your connection." };
      job.onFail?.(err);
    }
    state = { ...state, saving: queue.length };
    emit();
  }
  busy = false;
}

/** Adds a developed shot to the queue. `onFail` hands the shot back if it can't be saved. */
export function queueShot(roll, { blob, width, height }, onFail) {
  queue.push({ roll, blob, width, height, onFail });
  state = { ...state, saving: queue.length + (busy ? 1 : 0) };
  emit();
  drain();
}

// Seen developed rolls, so "your roll developed" shows once per device.
const seenKey = (id) => `mesh:roll-seen:${id}`;
export function rollSeen(id) { try { return !!localStorage.getItem(seenKey(id)); } catch { return true; } }
export function markRollSeen(id) { try { localStorage.setItem(seenKey(id), "1"); } catch { /* storage blocked */ } }

/** Your rolls that developed in the last three days and you haven't opened since. */
export async function fetchFreshlyDeveloped(now = Date.now()) {
  const mine = await fetchMyRolls().catch(() => []);
  return mine.filter((r) => isDeveloped(r, now) && now - tsMillis(r.developAt) < 3 * DAY && !rollSeen(r.id) && (r.photoCount || 0) > 0);
}

// The develop time in a calendar, so a phone reminds you at 9am.

const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

export function rollIcs(roll) {
  const at = tsMillis(roll.developAt);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mesh//Rolls//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:roll-${roll.id}@mesh`,
    `DTSTAMP:${icsTime(Date.now())}`,
    `DTSTART:${icsTime(at)}`,
    `DTEND:${icsTime(at + 15 * 60000)}`,
    `SUMMARY:${icsText(`Your roll develops: ${roll.title}`)}`,
    `DESCRIPTION:${icsText(rollUrl(roll.id))}`,
    `URL:${rollUrl(roll.id)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${roll.title} has developed`)}`, "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function rollGoogleCalendarUrl(roll) {
  const at = tsMillis(roll.developAt);
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: `Your roll develops: ${roll.title}`,
    dates: `${icsTime(at)}/${icsTime(at + 15 * 60000)}`,
    details: rollUrl(roll.id),
  })}`;
}

// Gatherings: the host can start one roll for a gathering.
export async function startGatheringRoll(event) {
  const roll = await createRoll({
    title: event.title,
    developAt: nextDevelopAt(Math.max(Date.now(), tsMillis(event.startsAt))),
    gatheringId: event.id,
  });
  await updateDoc(doc(db, "events", event.id), { rollId: roll.id });
  return roll;
}
