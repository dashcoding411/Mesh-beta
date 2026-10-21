// Daily caps for accounts under a week old (rules: dailyOk), against follow
// and DM farms: rateLimits/{uid} keeps a 24-hour window per kind (`<kind>Win`
// when it opened, `<kind>N` used so far), moved in the same write as the
// follow or new conversation. Older accounts keep the window but have no cap.
import { doc, getDoc, increment, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { isFreshAccount } from "../fresh.js";
import { me, tsMillis } from "./core.js";

export const DAILY_CAPS = { follow: 60, chat: 20 };
const DAY = 86400000;
const CAPPED = {
  follow: `New accounts can follow up to ${DAILY_CAPS.follow} people a day. Try again tomorrow.`,
  chat: `New accounts can start up to ${DAILY_CAPS.chat} conversations a day. Try again tomorrow.`,
};

let mine = null; // { uid, data }: this account's rateLimits, as last written

async function windowData() {
  const uid = me();
  if (mine?.uid !== uid) {
    const snap = await getDoc(doc(db, "rateLimits", uid)).catch(() => null);
    mine = { uid, data: snap?.exists() ? { ...snap.data() } : {} };
  }
  return mine.data;
}

/**
 * Runs `write(fields)`, where `fields` go into the rateLimits write in the same
 * batch. Which fields depends on whether today's window is still open, judged
 * by the server's clock, so a refused write is tried once the other way.
 */
export async function inWindow(kind, profile, write) {
  const data = await windowData();
  const open = tsMillis(data[`${kind}Win`]) > Date.now() - DAY;
  if (open && isFreshAccount(profile) && (data[`${kind}N`] || 0) >= DAILY_CAPS[kind]) {
    throw Object.assign(new Error(CAPPED[kind]), { code: "daily-cap" });
  }
  const fields = (o) => (o ? { [`${kind}N`]: increment(1) } : { [`${kind}Win`]: serverTimestamp(), [`${kind}N`]: 1 });
  let used = open;
  try {
    await write(fields(open));
  } catch (err) {
    if (err?.code !== "permission-denied") throw err;
    used = !open;
    try { await write(fields(used)); } catch (again) { mine = null; throw again; }
  }
  if (used) data[`${kind}N`] = (data[`${kind}N`] || 0) + 1;
  else Object.assign(data, { [`${kind}Win`]: Timestamp.now(), [`${kind}N`]: 1 });
}

/** The message for a daily cap, or null for any other error. */
export const limitMessage = (err) => (err?.code === "daily-cap" ? err.message : null);
