import { auth } from "../../firebase";

export function tsMillis(t) {
  return t?.toMillis ? t.toMillis() : 0;
}

export function snapToList(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function me() {
  return auth.currentUser?.uid;
}

