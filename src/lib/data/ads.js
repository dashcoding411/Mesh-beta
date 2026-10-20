// Ads: sold directly to local businesses and clubs, labelled, and placed in
// Home between posts. Targeting uses only what someone told Mesh (their town,
// the interests they picked, and whether they're 18 or over), never what they
// do on Mesh. Advertisers get totals (views and taps), never people.
import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, limit, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";

export const AD_LIMITS = { advertiser: 60, headline: 80, body: 240, cta: 24, town: 40, towns: 10, interests: 5 };
export const CTA_CHOICES = ["Learn more", "Visit", "Get the deal", "Book now", "Order now", "Sign up", "RSVP"];

const adsRef = () => collection(db, "ads");

/** Staff: every ad, newest first. */
export async function fetchAllAds() {
  return snapToList(await getDocs(query(adsRef(), limit(200)))).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

let liveOnce = null;
/** Ads switched on, fetched once per visit. */
export function fetchLiveAds() {
  liveOnce ||= getDocs(query(adsRef(), where("active", "==", true), limit(50)))
    .then(snapToList)
    .catch(() => { liveOnce = null; return []; });
  return liveOnce;
}

/** Running now: switched on and inside its dates. */
export const adRunning = (ad, now = Date.now()) => ad.active && tsMillis(ad.startsAt) <= now && now < tsMillis(ad.endsAt);

const ageOf = (profile) => (profile?.birthYear > 0 ? new Date().getFullYear() - profile.birthYear : null);

/** Whether `ad` may be shown to this viewer, from what they've told Mesh. */
export function adFits(ad, { profile, interests = [], guest = false }) {
  if (ad.adultsOnly) {
    const age = guest ? null : ageOf(profile);
    if (age === null || age < 18) return false;
  }
  const towns = (ad.towns || []).map((t) => t.toLowerCase());
  if (towns.length) {
    const mine = String(profile?.town || "").toLowerCase();
    if (!mine || !towns.some((t) => mine.includes(t))) return false;
  }
  if ((ad.interests || []).length && !ad.interests.some((i) => interests.includes(i))) return false;
  return true;
}

/** Why this viewer sees it, in words (for "Why am I seeing this?"). */
export function adReason(ad) {
  const parts = [];
  if ((ad.towns || []).length) parts.push(`people in ${ad.towns.join(", ")}`);
  if ((ad.interests || []).length) parts.push("people who picked one of its interests");
  if (ad.adultsOnly) parts.push("people 18 and over");
  return parts.length
    ? `It's shown to ${parts.join(", and ")}, from what you've told Mesh. It isn't based on what you do on Mesh.`
    : "It's shown to everyone on Mesh. It isn't based on anything about you.";
}

// Totals only: one view per ad per visit, and every tap.
const viewed = new Set();
export function countAdView(ad) {
  if (!me() || viewed.has(ad.id)) return;
  viewed.add(ad.id);
  updateDoc(doc(db, "ads", ad.id), { impressions: increment(1) }).catch(() => {});
}
export function countAdTap(ad) {
  if (!me()) return;
  updateDoc(doc(db, "ads", ad.id), { clicks: increment(1) }).catch(() => {});
}

const fields = (a) => ({
  advertiser: a.advertiser.trim().slice(0, AD_LIMITS.advertiser),
  headline: a.headline.trim().slice(0, AD_LIMITS.headline),
  body: a.body.trim().slice(0, AD_LIMITS.body),
  imageUrl: a.imageUrl || "",
  linkUrl: a.linkUrl.trim(),
  cta: a.cta,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  active: !!a.active,
  towns: a.towns.map((t) => t.trim()).filter(Boolean).slice(0, AD_LIMITS.towns).map((t) => t.slice(0, AD_LIMITS.town)),
  interests: a.interests.slice(0, AD_LIMITS.interests),
  adultsOnly: !!a.adultsOnly,
});

export async function createAd(ad) {
  const ref = await addDoc(adsRef(), {
    ...fields(ad), impressions: 0, clicks: 0, createdBy: me(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  liveOnce = null;
  return ref.id;
}

export async function updateAd(id, ad) {
  await updateDoc(doc(db, "ads", id), { ...fields(ad), updatedAt: serverTimestamp() });
  liveOnce = null;
}

export async function setAdActive(id, active) {
  await updateDoc(doc(db, "ads", id), { active, updatedAt: serverTimestamp() });
  liveOnce = null;
}

export async function deleteAd(id) {
  await deleteDoc(doc(db, "ads", id));
  liveOnce = null;
}

// Ad requests (Settings > Advertise on Mesh): an adult asks for a spot with
// the ad they'd like; admins review it and turn it into an ad. Private to
// them and admins (firestore.rules).

const requestsRef = () => collection(db, "adRequests");

export async function submitAdRequest(ad, { contactEmail, budget = "", notes = "", username }) {
  const { active: _active, ...content } = fields({ ...ad, active: false });
  await addDoc(requestsRef(), {
    ...content,
    uid: me(),
    username,
    contactEmail: contactEmail.trim().slice(0, 120),
    budget: budget.trim().slice(0, 60),
    notes: notes.trim().slice(0, 500),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function fetchMyAdRequests() {
  if (!me()) return [];
  const snap = await getDocs(query(requestsRef(), where("uid", "==", me()), limit(20)));
  return snapToList(snap).sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/** Admins: requests waiting for a decision, oldest first. */
export async function fetchAdRequests() {
  const snap = await getDocs(query(requestsRef(), where("status", "==", "pending"), limit(100)));
  return snapToList(snap).sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
}

export async function decideAdRequest(id, { approved, note = "", adId = "" }) {
  await updateDoc(doc(db, "adRequests", id), {
    status: approved ? "approved" : "declined",
    note: note.trim().slice(0, 300),
    ...(adId ? { adId } : {}),
    decidedAt: serverTimestamp(),
  });
}
