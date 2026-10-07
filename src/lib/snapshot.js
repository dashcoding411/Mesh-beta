// Copies of what Mesh shows first (your own account and the top of Home),
// kept on this device so Mesh opens straight away and then refreshes them.
// Keyed by account, and all removed whenever nobody is signed in.
import { Timestamp } from "firebase/firestore";

const PREFIX = "mesh:snap:";
const MAX_CHARS = 300_000;

// Firestore times come back from JSON as { seconds, nanoseconds }.
const revive = (_key, v) => (v && typeof v === "object" && typeof v.seconds === "number" && typeof v.nanoseconds === "number"
  && Object.keys(v).length <= 3 ? new Timestamp(v.seconds, v.nanoseconds) : v);

/** The saved copy called `name`, or null if there isn't one younger than `maxAgeMs`. */
export function readSnapshot(name, maxAgeMs) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw, revive);
    return Date.now() - at < maxAgeMs ? data : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(name, data) {
  try {
    const raw = JSON.stringify({ at: Date.now(), data });
    if (raw.length <= MAX_CHARS) localStorage.setItem(PREFIX + name, raw);
    else localStorage.removeItem(PREFIX + name);
  } catch { /* storage full or blocked: Mesh just opens the slower way */ }
}

export function clearSnapshots() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked */ }
}
