// Gatherings: events, replies and their discussion.
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, limit,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchProfile } from "./users.js";

// ---------- gatherings (events, scoped to a circle or standalone) ----------
// Public gatherings take Going / Interested; private ones take Going / Maybe /
// Can't go so a host can count heads exactly.

export const RSVP_OPTIONS = {
  public: [
    { id: "going", label: "Going" },
    { id: "interested", label: "Interested" },
  ],
  private: [
    { id: "going", label: "Going" },
    { id: "maybe", label: "Maybe" },
    { id: "cant", label: "Can't go" },
  ],
};

/* Who can see a gathering (mirrors canViewEvent in firestore.rules):
   public ones, anyone; private ones, the host, people they've invited, and
   members of the circle it belongs to. */
export function canViewEvent(event, membership) {
  if (!event) return false;
  return event.privacy === "public" || event.hostId === me()
    || (event.invitees || []).includes(me()) || (!!event.groupId && !!membership);
}

/** Who can post in a gathering's discussion: the host, and anyone who replied. */
export function canPostInEvent(event, myStatus) {
  if (event.hostId === me()) return true;
  return event.guestPosting !== "host" && !!myStatus;
}

export function isEventFull(event) {
  return (event.capacity || 0) > 0 && (event.goingCount || 0) >= event.capacity;
}

/** A circle's gatherings: all of them for members, only public ones otherwise. */
export async function fetchEvents(groupId = "", { member = false } = {}) {
  const q = groupId
    ? member
      ? query(collection(db, "events"), where("groupId", "==", groupId), limit(100))
      : query(collection(db, "events"), where("groupId", "==", groupId), where("privacy", "==", "public"), limit(100))
    : query(collection(db, "events"), where("privacy", "==", "public"), limit(100));
  return snapToList(await getDocs(q)).sort((a, b) => tsMillis(a.startsAt) - tsMillis(b.startsAt));
}

/** Private gatherings you've been invited to. */
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
  const profile = await fetchProfile(user.uid);
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

/** Invite people to a private gathering by adding them to its guest list. */
export async function inviteToEvent(eventId, users) {
  await updateDoc(doc(db, "events", eventId), { invitees: arrayUnion(...users.map((u) => u.id)) });
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

/* One atomic write: the reply and the head-count change land together or
   not at all, so the count can't drift and a full gathering can't be
   overfilled (the rules check capacity against the count after the write). */
export async function setRsvp(event, previous, next) {
  const uid = me();
  const profile = await fetchProfile(uid);
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
  const counters = {};
  if (delta.goingCount) counters.goingCount = increment(delta.goingCount);
  if (delta.interestedCount) counters.interestedCount = increment(delta.interestedCount);
  if (Object.keys(counters).length) batch.update(eventRef, counters);
  await batch.commit();
  return result;
}

// --- a gathering's discussion ---
// Guests (anyone who's replied) and the host post here; the host can switch
// it to host-only so it reads as announcements. Stored under the gathering,
// so a private gathering's discussion is exactly as private as the gathering.

export async function fetchEventPosts(eventId) {
  const q = query(collection(db, "events", eventId, "posts"), orderBy("createdAt", "desc"), limit(100));
  return snapToList(await getDocs(q));
}

export async function addEventPost(eventId, text) {
  const profile = await fetchProfile(me());
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

// Announcements from before discussions existed. Read-only now; they show
// in the discussion as posts from the host.
export async function fetchAnnouncements(eventId) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "asc"), limit(100));
  return snapToList(await getDocs(q));
}
