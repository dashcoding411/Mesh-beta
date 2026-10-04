// Contact sync, like Instagram's, without uploading anyone's address book.
// Phone numbers and emails are read and scrambled (SHA-256) on the device,
// then each code is looked up in contactKeys, where people who chose to be
// findable registered the code for their own verified number or email (the
// rules recompute it from their sign-in, so nobody can claim someone else's).
// Contacts' names, numbers and emails are never sent or stored; only the
// accounts found are saved, privately, for suggestions.
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const NAMESPACE = "mesh-contact-v1:";
export const MAX_IDENTIFIERS = 1500;

/** E.164, assuming Australian numbers when there's no country code. */
export function normalizePhone(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const plus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return "";
  if (plus) return s.length >= 8 ? `+${s}` : "";
  if (s.startsWith("00")) return s.length >= 10 ? `+${s.slice(2)}` : "";
  if (s.startsWith("61") && s.length === 11) return `+${s}`;
  if (s.startsWith("0") && s.length === 10) return `+61${s.slice(1)}`;
  if (s.length === 9 && s.startsWith("4")) return `+61${s}`;
  return "";
}

export function normalizeEmail(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

/** The lookup code for an identifier (lower-case hex SHA-256). */
export async function contactKey(value) {
  const bytes = new TextEncoder().encode(NAMESPACE + value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Phone numbers and emails from a vCard (.vcf) export. */
export function parseVcf(text) {
  const phones = [];
  const emails = [];
  // Unfold continuation lines first.
  for (const line of String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    const m = line.match(/^(?:item\d+\.)?(TEL|EMAIL)[^:]*:(.*)$/i);
    if (!m) continue;
    const value = m[2].replace(/^tel:/i, "").trim();
    if (m[1].toUpperCase() === "TEL") phones.push(value); else emails.push(value);
  }
  return { phones, emails };
}

/** The device's contact picker (Android Chrome), or null where there isn't one. */
export const canPickContacts = () => typeof navigator !== "undefined" && "contacts" in navigator && "select" in navigator.contacts;

export async function pickContacts() {
  const picked = await navigator.contacts.select(["tel", "email"], { multiple: true });
  return {
    phones: picked.flatMap((c) => c.tel || []),
    emails: picked.flatMap((c) => c.email || []),
  };
}

/** Scrambled, de-duplicated codes for a set of contacts (never leaves the device as raw values). */
export async function contactCodes({ phones = [], emails = [] }) {
  const values = [...new Set([...phones.map(normalizePhone), ...emails.map(normalizeEmail)].filter(Boolean))].slice(0, MAX_IDENTIFIERS);
  return Promise.all(values.map(contactKey));
}

/** Accounts registered under any of `codes`, excluding you. */
export async function findAccounts(codes) {
  const me = auth.currentUser?.uid;
  const found = new Set();
  // One lookup per code: the collection can't be listed, only asked about a code.
  for (let i = 0; i < codes.length; i += 25) {
    const batch = await Promise.all(codes.slice(i, i + 25).map((c) => getDoc(doc(db, "contactKeys", c)).catch(() => null)));
    for (const snap of batch) {
      const uid = snap?.exists() ? snap.data().uid : null;
      if (uid && uid !== me) found.add(uid);
    }
  }
  return [...found];
}

// Being findable: only your own verified phone number or email.

function myIdentifier(kind) {
  const u = auth.currentUser;
  if (!u) return "";
  if (kind === "phone") return u.phoneNumber || "";
  return u.email && u.emailVerified ? u.email.toLowerCase() : "";
}

/** What this account can offer: { phone, email } as the values, or "" when not verified. */
export const findableIdentifiers = () => ({ phone: myIdentifier("phone"), email: myIdentifier("email") });

export async function isFindable(kind) {
  const id = myIdentifier(kind);
  if (!id) return false;
  const snap = await getDoc(doc(db, "contactKeys", await contactKey(id))).catch(() => null);
  return !!snap?.exists() && snap.data().uid === auth.currentUser.uid;
}

export async function setFindable(kind, on) {
  const id = myIdentifier(kind);
  if (!id) throw new Error(kind === "phone" ? "Add a phone number to your account first." : "Verify your email first.");
  const ref = doc(db, "contactKeys", await contactKey(id));
  if (on) await setDoc(ref, { uid: auth.currentUser.uid, kind, createdAt: serverTimestamp() });
  else await deleteDoc(ref);
}

// The accounts found in your contacts, kept privately for suggestions.

const matchesRef = () => doc(db, "users", auth.currentUser.uid, "private", "contacts");

export async function saveContactMatches(uids) {
  await setDoc(matchesRef(), { uids: uids.slice(0, 500), syncedAt: serverTimestamp() });
}

export async function fetchContactMatches() {
  if (!auth.currentUser) return [];
  const snap = await getDoc(matchesRef()).catch(() => null);
  return snap?.exists() ? snap.data().uids || [] : [];
}

export async function clearContactMatches() {
  await deleteDoc(matchesRef()).catch(() => {});
}
