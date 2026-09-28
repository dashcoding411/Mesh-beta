// Shared helpers: who's signed in, timestamps, snapshots, and opening a profile.
import { auth } from "../../firebase";
import { navigate } from "../router";

export function tsMillis(t) {
  return t?.toMillis ? t.toMillis() : 0;
}

export function timeAgo(t) {
  const ms = tsMillis(t);
  if (!ms) return "just now";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function snapToList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function me() {
  return auth.currentUser?.uid;
}

// ---------- tiny app-wide navigation bus ----------

export function openUserProfile(uid) {
  if (!uid) return;
  if (uid === me()) navigate("/account");
  else navigate(`/u/${encodeURIComponent(uid)}`, { overlay: true });
}
