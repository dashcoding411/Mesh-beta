// Session cache of current profile cards. Content stores its author's name
// and photo at write time; this overlays the current ones (one read per uid).
// Requests made together (a feed's worth of avatars) are read together, 30
// to a query, and on-screen avatars update once per batch, not once per uid.

import { useEffect, useSyncExternalStore } from "react";
import { collection, documentId, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { fetchProfile } from "./db";
import { badgesOf } from "./badges";

const cards = new Map(); // uid -> { name, username, photoURL, badges } | null
const cardOf = (p) => ({ name: p.name || "", username: p.username || "", photoURL: p.photoURL || "", badges: badgesOf(p) });
const pending = new Set();
const queued = new Set();
const listeners = new Set();
let version = 0;
let timer = null;
// False once the rules refuse the batched query (signed out), then one read each.
let queriesOk = true;

const emit = () => { version += 1; listeners.forEach((fn) => fn()); };

async function readBatch(ids) {
  if (queriesOk) {
    try {
      for (let i = 0; i < ids.length; i += 30) {
        // The rules allow listing profiles only signed in, at most 50 at a time.
        const snap = await getDocs(query(collection(db, "users"), where(documentId(), "in", ids.slice(i, i + 30)), limit(30)));
        snap.docs.forEach((d) => cards.set(d.id, cardOf(d.data())));
      }
      ids.forEach((id) => { if (!cards.has(id)) cards.set(id, null); });
      return;
    } catch {
      queriesOk = false;
    }
  }
  await Promise.all(ids.map((uid) => fetchProfile(uid)
    .then((p) => { cards.set(uid, p ? cardOf(p) : null); })
    .catch(() => {})));
}

function flush() {
  timer = null;
  const ids = [...queued];
  queued.clear();
  readBatch(ids).finally(() => { ids.forEach((id) => pending.delete(id)); emit(); });
}

function load(uid) {
  if (!uid || cards.has(uid) || pending.has(uid)) return;
  pending.add(uid);
  queued.add(uid);
  timer ||= setTimeout(flush, 30);
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
