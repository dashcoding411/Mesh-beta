// Session cache of current profile cards. Content stores its author's name
// and photo at write time; this overlays the current ones (one read per uid).

import { useEffect, useSyncExternalStore } from "react";
import { fetchProfile } from "./db";

const cards = new Map(); // uid -> { name, username, photoURL, badges } | null
const cardOf = (p) => ({ name: p.name || "", username: p.username || "", photoURL: p.photoURL || "", badges: p.badges || [] });
const pending = new Map(); // uid -> Promise
const listeners = new Set();
let version = 0;

const emit = () => { version += 1; listeners.forEach((fn) => fn()); };

function load(uid) {
  if (!uid || cards.has(uid) || pending.has(uid)) return;
  pending.set(uid, fetchProfile(uid)
    .then((p) => { cards.set(uid, p ? cardOf(p) : null); })
    .catch(() => {})
    .finally(() => { pending.delete(uid); emit(); }));
}

export function primeCard(uid, profile) {
  if (!uid || !profile) return;
  cards.set(uid, cardOf(profile));
  emit();
}

/** `fallback` overlaid with the cached current card once loaded. */
export function useLiveCard(uid, fallback) {
  useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => version, () => version);
  useEffect(() => { load(uid); }, [uid]);
  const live = cards.get(uid);
  if (!live) return fallback;
  return { ...fallback, name: live.name || fallback.name, username: live.username || fallback.username, photoURL: live.photoURL, badges: live.badges };
}
