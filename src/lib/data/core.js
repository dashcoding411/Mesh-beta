import { auth } from "../../firebase";
import { navigate } from "../router";

export function tsMillis(t) {
  return t?.toMillis ? t.toMillis() : 0;
}

export function snapToList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function me() {
  return auth.currentUser?.uid;
}

export function openUserProfile(uid) {
  if (!uid) return;
  if (uid === me()) navigate("/account");
  else navigate(`/u/${encodeURIComponent(uid)}`, { overlay: true });
}
