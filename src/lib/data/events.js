// Gatherings (events): RSVPs, invites, discussion and calendar export.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, limit,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { myProfile } from "./users.js";
import { notify } from "./notifications.js";

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
    : query(collection(db, "events"), where("privacy", "==", "public"), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

export async function fetchInvitedEvents() {
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

export async function deleteEvent(eventId) {
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

// Legacy announcements, shown as host posts.
export async function fetchAnnouncements(eventId) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "asc"), limit(100));
  return snapToList(await getDocs(q));
}
