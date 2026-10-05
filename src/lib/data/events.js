// Gatherings (events): RSVPs, invites, discussion and calendar export.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, documentId, getDoc, getDocs, increment, limit,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { myProfile } from "./users.js";
import { notify } from "./notifications.js";
import { uploadPhotos } from "./uploads.js";
import { deleteInline } from "./posts.js";
import { forget, remind } from "../push.js";

// Public gatherings: going/interested. Private: going/maybe/not going.

export const RSVP_OPTIONS = {
  public: [
    { id: "going", label: "Going" },
    { id: "interested", label: "Interested" },
    { id: "cant", label: "Can't go" },
  ],
  private: [
    { id: "going", label: "Going" },
    { id: "maybe", label: "Maybe" },
    { id: "cant", label: "Can't go" },
  ],
};

// Mirrors canViewEvent in firestore.rules.
export function canViewEvent(event, membership) {
  if (!event) return false;
  return event.privacy === "public" || event.hostId === me()
    || (event.invitees || []).includes(me()) || (!!event.groupId && !!membership);
}

export function canPostInEvent(event, myStatus) {
  if (event.hostId === me()) return true;
  return event.guestPosting !== "host" && !!myStatus;
}

export function isEventFull(event) {
  return (event.capacity || 0) > 0 && (event.goingCount || 0) >= event.capacity;
}

export async function fetchEvents(groupId = "", { member = false } = {}) {
  const q = groupId
    ? member
      ? query(collection(db, "events"), where("groupId", "==", groupId), limit(100))
      : query(collection(db, "events"), where("groupId", "==", groupId), where("privacy", "==", "public"), limit(100))
    : me()
      ? query(collection(db, "events"), where("privacy", "==", "public"), limit(100))
      // Signed out, circle gatherings are listed on the circle's page.
      : query(collection(db, "events"), where("privacy", "==", "public"), where("groupId", "==", ""), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

/**
 * Public gatherings from a few hours ago onwards, soonest first. Signed out,
 * only those outside circles (the rules). Falls back to the unordered list
 * while the index is still building.
 */
export async function fetchUpcomingPublicEvents(max = 150) {
  const since = Timestamp.fromMillis(Date.now() - 3 * 3600000);
  const filters = me()
    ? [where("privacy", "==", "public")]
    : [where("privacy", "==", "public"), where("groupId", "==", "")];
  try {
    return snapToList(await getDocs(query(collection(db, "events"), ...filters, where("startsAt", ">=", since), orderBy("startsAt", "asc"), limit(max))));
  } catch (err) {
    if (err?.code !== "failed-precondition") throw err;
    return (await fetchEvents()).filter((e) => e.privacy === "public" && tsMillis(e.startsAt) >= since.toMillis());
  }
}

export async function fetchInvitedEvents() {
  if (!me()) return [];
  const q = query(collection(db, "events"), where("invitees", "array-contains", me()), limit(50));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

export async function fetchEvent(eventId) {
  const snap = await getDoc(doc(db, "events", eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEvent({
  title, description, location, startsAt, privacy = "public", groupId = "", ticketUrl = "",
  showGuestList = true, capacity = 0, guestPosting = "guests",
}) {
  const user = auth.currentUser;
  const profile = await myProfile();
  const event = {
    title,
    description,
    location,
    startsAt,
    privacy,
    groupId,
    ticketUrl,
    showGuestList,
    capacity: Math.max(0, Math.floor(capacity) || 0), // 0 = no limit
    guestPosting: guestPosting === "host" ? "host" : "guests",
    invitees: [],
    hostId: user.uid,
    hostName: profile?.username || "unknown",
    goingCount: 1,
    interestedCount: 0,
    createdAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db, "events"), event);
  await setDoc(doc(db, "events", refDoc.id, "rsvps", user.uid), {
    status: "going",
    username: profile?.username || "",
    createdAt: serverTimestamp(),
  });
  return { id: refDoc.id, ...event, createdAt: Timestamp.now() };
}

export async function updateEvent(eventId, fields) {
  await updateDoc(doc(db, "events", eventId), fields);
}

/** Clears the discussion and photos first; the host may delete both. */
export async function deleteEvent(eventId) {
  for (const sub of ["photos", "posts"]) {
    const snap = await getDocs(query(collection(db, "events", eventId, sub), limit(300))).catch(() => null);
    for (const d of snap?.docs || []) await deleteDoc(d.ref).catch(() => {});
  }
  await deleteDoc(doc(db, "events", eventId));
}

export async function inviteToEvent(eventId, users) {
  await updateDoc(doc(db, "events", eventId), { invitees: arrayUnion(...users.map((u) => u.id)) });
  users.forEach((u) => notify(u.id, "invite", { ref: eventId }));
}

export async function uninviteFromEvent(eventId, uid) {
  await updateDoc(doc(db, "events", eventId), { invitees: arrayRemove(uid) });
}

export async function fetchMyRsvps(eventIds) {
  const uid = me();
  const map = new Map();
  if (!uid) return map;
  await Promise.all(
    eventIds.map(async (id) => {
      const snap = await getDoc(doc(db, "events", id, "rsvps", uid)).catch(() => null);
      if (snap?.exists()) map.set(id, snap.data().status);
    })
  );
  return map;
}

export async function fetchGuestList(eventId) {
  const q = query(collection(db, "events", eventId, "rsvps"), limit(200));
  return snapToList(await getDocs(q));
}

// RSVP and head count change atomically; the rules check capacity post-write.
export async function setRsvp(event, previous, next) {
  const uid = me();
  const profile = await myProfile();
  const rsvpRef = doc(db, "events", event.id, "rsvps", uid);
  const eventRef = doc(db, "events", event.id);
  const result = previous === next ? null : next;
  const delta = { goingCount: 0, interestedCount: 0 };
  const field = (s) => (s === "going" ? "goingCount" : s === "interested" ? "interestedCount" : null);
  if (field(previous)) delta[field(previous)] -= 1;
  if (field(result)) delta[field(result)] += 1;

  const batch = writeBatch(db);
  if (result) batch.set(rsvpRef, { status: result, username: profile?.username || "", createdAt: serverTimestamp() });
  else batch.delete(rsvpRef);
  // Mirror under users/{uid}/rsvps for upcoming lists.
  const mineRef = doc(db, "users", uid, "rsvps", event.id);
  if (result) {
    batch.set(mineRef, {
      status: result,
      title: (event.title || "").slice(0, 150),
      location: (event.location || "").slice(0, 300),
      startsAt: event.startsAt,
      updatedAt: serverTimestamp(),
    });
  } else batch.delete(mineRef);
  const counters = {};
  if (delta.goingCount) counters.goingCount = increment(delta.goingCount);
  if (delta.interestedCount) counters.interestedCount = increment(delta.interestedCount);
  if (Object.keys(counters).length) batch.update(eventRef, counters);
  await batch.commit();
  // A reminder 2 hours before, on devices with notifications on.
  if (result && result !== "cant") remind("gathering", event.id).catch(() => {});
  else forget("gathering", event.id);
  return result;
}

export async function fetchUpcomingRsvps(max = 10) {
  const since = Timestamp.fromMillis(Date.now() - 3 * 3600000);
  const q = query(collection(db, "users", me(), "rsvps"), where("startsAt", ">=", since), orderBy("startsAt", "asc"), limit(max));
  const list = snapToList(await getDocs(q));
  return list.filter((r) => r.status !== "cant");
}

export async function fetchPublicEvent(eventId) {
  const snap = await getDoc(doc(db, "events", eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function eventUrl(eventId) {
  return `${window.location.origin}/gatherings/${encodeURIComponent(eventId)}`;
}

// Calendar export. Events have no end time, so two hours is assumed.

const HOURS = 2;
const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** iCalendar export with alarms at 1 day and 2 hours. */
export function eventIcs(event) {
  const start = tsMillis(event.startsAt);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mesh//Gatherings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@mesh`,
    `DTSTAMP:${icsTime(Date.now())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(start + HOURS * 3600000)}`,
    `SUMMARY:${icsText(event.title)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : null,
    `DESCRIPTION:${icsText(`${(event.description || "").slice(0, 600)}\n\n${eventUrl(event.id)}`)}`,
    `URL:${eventUrl(event.id)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(event.title)} is tomorrow`, "TRIGGER:-PT24H", "END:VALARM",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(event.title)} starts in 2 hours`, "TRIGGER:-PT2H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function googleCalendarUrl(event) {
  const start = tsMillis(event.startsAt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "",
    dates: `${icsTime(start)}/${icsTime(start + HOURS * 3600000)}`,
    details: `${(event.description || "").slice(0, 600)}\n\n${eventUrl(event.id)}`,
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Discussion: host and RSVP'd guests, or host-only. Stored under the event so
// it inherits the event's visibility.

export async function fetchEventPosts(eventId) {
  const q = query(collection(db, "events", eventId, "posts"), orderBy("createdAt", "desc"), limit(100));
  return snapToList(await getDocs(q));
}

export async function addEventPost(eventId, text) {
  const profile = await myProfile();
  const post = {
    authorId: me(),
    authorName: profile?.username || "",
    authorDisplayName: profile?.name || profile?.username || "",
    authorPhoto: profile?.photoURL || "",
    text,
    likedBy: [],
    createdAt: serverTimestamp(),
  };
  const ref_ = await addDoc(collection(db, "events", eventId, "posts"), post);
  return { id: ref_.id, ...post, createdAt: Timestamp.now() };
}

export async function deleteEventPost(eventId, postId) {
  await deleteDoc(doc(db, "events", eventId, "posts", postId));
}

export async function toggleEventPostLike(eventId, post, liked) {
  await updateDoc(doc(db, "events", eventId, "posts", post.id), {
    likedBy: liked ? arrayRemove(me()) : arrayUnion(me()),
  });
}

// Friends going: people you follow among a gathering's Going replies. Only
// where the guest list is shown (the rules check), at most 90 follows a card.

export async function fetchFriendsGoing(events, followingIds) {
  const out = new Map();
  const ids = [...followingIds].slice(0, 90);
  if (!me() || !ids.length) return out;
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  await Promise.all(events.map(async (ev) => {
    if (ev.showGuestList === false && ev.hostId !== me()) return;
    const snaps = await Promise.all(chunks.map((c) => getDocs(query(collection(db, "events", ev.id, "rsvps"), where(documentId(), "in", c))).catch(() => null)));
    const going = snaps.flatMap((s) => s?.docs || []).filter((d) => d.data().status === "going")
      .map((d) => ({ id: d.id, username: d.data().username || "" }));
    if (going.length) out.set(ev.id, going);
  }));
  return out;
}

/** "@ana is going", "@ana and @ben are going", "@ana and 3 others you follow are going". */
export function friendsGoingLabel(friends) {
  const names = friends.map((f) => `@${f.username || "someone"}`);
  if (names.length === 1) return `${names[0]} is going`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are going`;
  return `${names[0]} and ${names.length - 1} others you follow are going`;
}

// Photos from the day: once a gathering starts, the host and anyone going can
// add photos for everyone who can see the gathering, for 30 days.

export const PHOTOS_OPEN_DAYS = 30;
export const MAX_PHOTOS_AT_ONCE = 6;

export function photosOpen(event, now = Date.now()) {
  const start = tsMillis(event?.startsAt);
  return !!start && now >= start && now < start + PHOTOS_OPEN_DAYS * 86400000;
}

export function canAddEventPhotos(event, myStatus, now = Date.now()) {
  return photosOpen(event, now) && (event.hostId === me() || myStatus === "going");
}

export async function fetchEventPhotos(eventId) {
  const q = query(collection(db, "events", eventId, "photos"), orderBy("createdAt", "desc"), limit(200));
  return snapToList(await getDocs(q));
}

/** Checks and stores the photos (lib/imageCheck.js runs first), then adds them to the gathering. */
export async function addEventPhotos(eventId, files, onProgress) {
  const profile = await myProfile();
  const stored = await uploadPhotos(files.slice(0, MAX_PHOTOS_AT_ONCE), onProgress);
  const batch = writeBatch(db);
  const added = stored.map((s) => {
    const ref_ = doc(collection(db, "events", eventId, "photos"));
    const photo = {
      authorId: me(), authorName: profile?.username || "", url: s.url,
      width: Math.round(s.width || 0), height: Math.round(s.height || 0), createdAt: serverTimestamp(),
    };
    batch.set(ref_, photo);
    return { id: ref_.id, ...photo, createdAt: Timestamp.now() };
  });
  try { await batch.commit(); }
  catch (err) {
    stored.forEach((s) => deleteInline(s.url).catch(() => {}));
    throw err;
  }
  return added;
}

/** The photo's author or the host. The image itself goes when its author removes it. */
export async function deleteEventPhoto(eventId, photo) {
  await deleteDoc(doc(db, "events", eventId, "photos", photo.id));
  if (photo.authorId === me()) await deleteInline(photo.url).catch(() => {});
}

// Legacy announcements, shown as host posts.
export async function fetchAnnouncements(eventId) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "asc"), limit(100));
  return snapToList(await getDocs(q));
}
