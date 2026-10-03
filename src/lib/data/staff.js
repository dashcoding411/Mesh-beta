// Mesh staff: admins (set in the console) and the moderators they appoint.
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { isAdmin } from "./news.js";

let roleCheck = { uid: null, result: null };

/** "admin", "moderator" or null. Checked once per visit. */
export function staffRole() {
  const uid = me();
  if (!uid) return Promise.resolve(null);
  if (roleCheck.uid !== uid) {
    roleCheck = {
      uid,
      result: Promise.all([
        isAdmin(),
        getDoc(doc(db, "moderators", uid)).then((s) => s.exists()).catch(() => false),
      ]).then(([admin, mod]) => (admin ? "admin" : mod ? "moderator" : null)),
    };
    roleCheck.result.catch(() => { roleCheck = { uid: null, result: null }; });
  }
  return roleCheck.result;
}

export async function fetchModerators() {
  return snapToList(await getDocs(query(collection(db, "moderators"), limit(200))));
}

/** Staff only. `username` must belong to `uid` (the rules check). */
export async function addModerator({ uid, username }) {
  await setDoc(doc(db, "moderators", uid), { username, addedBy: me(), addedAt: serverTimestamp() });
}

export async function removeModerator(uid) {
  await deleteDoc(doc(db, "moderators", uid));
  if (uid === me()) roleCheck = { uid: null, result: null };
}
