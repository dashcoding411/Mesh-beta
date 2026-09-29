// People's current names and photos, for this visit.
//
// Posts and comments keep a copy of their author's name and photo from when
// they were written (the rules check it's genuinely theirs). Someone who
// changes their photo later would otherwise show two different faces on the
// same screen, so cards look up the current one here and fall back to the
// stored copy until it arrives. One read per person per visit.

import { useEffect, useSyncExternalStore } from "react";
import { fetchProfile } from "./db";

const cards = new Map(); // uid -> { name, username, photoURL } | null
const pending = new Map(); // uid -> Promise
const listeners = new Set();
let version = 0;

const emit = () => { version += 1; listeners.forEach((fn) => fn()); };

function load(uid) {
  if (!uid || cards.has(uid) || pending.has(uid)) return;
  pending.set(uid, fetchProfile(uid)
    .then((p) => { cards.set(uid, p ? { name: p.name || "", username: p.username || "", photoURL: p.photoURL || "" } : null); })
    .catch(() => {})
    .finally(() => { pending.delete(uid); emit(); }));
}

/** Put a known-current profile in (your own, after you change it). */
export function primeCard(uid, profile) {
  if (!uid || !profile) return;
  cards.set(uid, { name: profile.name || "", username: profile.username || "", photoURL: profile.photoURL || "" });
  emit();
}

/** `fallback` with the person's current name and photo laid over it once known. */
export function useLiveCard(uid, fallback) {
  useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => version, () => version);
  useEffect(() => { load(uid); }, [uid]);
  const live = cards.get(uid);
  if (!live) return fallback;
  return { ...fallback, name: live.name || fallback.name, username: live.username || fallback.username, photoURL: live.photoURL };
}
