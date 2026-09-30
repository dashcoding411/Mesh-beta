// Bricked-time stats and the leaderboard. Each claim is verified by the rules
// against the lock doc: a finished instant brick counts once for its exact
// duration; a past day counts its scheduled slots if the schedule was
// unchanged that day. Stats are private unless `public` is set.

import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { myProfile } from "./users.js";
import { localParts } from "../brick.js";

const statsRef = (uid) => doc(db, "brickStats", uid);
const DAY = 86400000;

/** ISO date of the local week's Monday, matching weekKeyOf in the rules. */
export function weekKeyFor(ms, offset) {
  const monday = localParts(ms - (localParts(ms, offset).dow - 1) * DAY, offset);
  return `${monday.year}-${monday.dayOfYear}`;
}

export function localMidnight(ms, offset) {
  const p = localParts(ms, offset);
  const into = (p.minuteOfDay * 60000) + (new Date(ms).getUTCSeconds() * 1000) + new Date(ms).getUTCMilliseconds();
  return ms - into;
}

export async function fetchBrickStats(uid = me()) {
  const snap = await getDoc(statsRef(uid)).catch(() => null);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

function card(profile) {
  return { username: profile.username, name: profile.name || "", photoURL: profile.photoURL || "" };
}

// Creates stats if needed, then claims any finished instant brick and whole
// scheduled days since the last claim, one verified write each.
export async function syncBrickStats(policy, raw) {
  if (!policy || !raw) return null;
  const offset = policy.tzOffset || 0;
  const profile = await myProfile();
  let stats = await fetchBrickStats();
  const now = Date.now();
  const week = weekKeyFor(now, offset);

  if (!stats) {
    stats = {
      ...card(profile), public: false, totalSeconds: 0, weekSeconds: 0, weekKey: week, streakDays: 0,
      instantUntil: raw.self.until, scheduleDay: Timestamp.fromMillis(localMidnight(now, offset)),
    };
    await setDoc(statsRef(me()), { ...stats, updatedAt: serverTimestamp() });
    return stats;
  }

  const base = () => (stats.weekKey === week ? stats.weekSeconds : 0);
  const write = async (next) => {
    await setDoc(statsRef(me()), { ...next, ...card(profile), weekKey: week, updatedAt: serverTimestamp() });
    stats = { ...stats, ...next, weekKey: week };
  };

  const until = raw.self.until?.toMillis?.() || 0;
  const since = raw.self.since?.toMillis?.() || until;
  if (until > (stats.instantUntil?.toMillis?.() || 0) && until <= now) {
    // Floor to match the rules' duration.seconds().
    const secs = Math.floor((until - since) / 1000);
    await write({ ...pick(stats), totalSeconds: stats.totalSeconds + secs, weekSeconds: base() + secs, instantUntil: raw.self.until })
      .catch(() => {});
  }

  const changed = policy.slotsChangedAt;
  if (changed) {
    const today = localMidnight(now, offset);
    // Days after the last claim and after slotsChangedAt, at most a week back.
    let firstFull = localMidnight(changed, offset);
    if (firstFull < changed) firstFull += DAY;
    let day = Math.max((stats.scheduleDay?.toMillis?.() || today) + DAY, firstFull, today - 7 * DAY);
    for (; day + DAY <= now; day += DAY) {
      const dow = localParts(day, offset).dow;
      const secs = (policy.self.slots?.[`d${dow}`] || []).length * 1800;
      if (!secs) continue;
      const prev = stats.scheduleDay?.toMillis?.() || 0;
      const ok = await write({
        ...pick(stats),
        totalSeconds: stats.totalSeconds + secs,
        weekSeconds: base() + secs,
        scheduleDay: Timestamp.fromMillis(day),
        streakDays: prev + DAY === day ? stats.streakDays + 1 : 1,
      }).then(() => true).catch(() => false);
      if (!ok) break;
    }
  }

  if (stats.weekKey !== week) await write({ ...pick(stats), weekSeconds: 0 }).catch(() => {});
  return stats;
}

const pick = (s) => ({
  public: s.public, totalSeconds: s.totalSeconds, weekSeconds: s.weekSeconds, streakDays: s.streakDays,
  instantUntil: s.instantUntil, scheduleDay: s.scheduleDay,
});

export async function setStatsPublic(policy, on) {
  const stats = await fetchBrickStats();
  if (!stats) return;
  const profile = await myProfile();
  const week = weekKeyFor(Date.now(), policy?.tzOffset || 0);
  await setDoc(statsRef(me()), {
    ...pick(stats), public: on, ...card(profile),
    weekKey: week, weekSeconds: stats.weekKey === week ? stats.weekSeconds : 0,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchLeaderboard(scope, week) {
  const stats = collection(db, "brickStats");
  const q = scope === "week"
    ? query(stats, where("public", "==", true), where("weekKey", "==", week), orderBy("weekSeconds", "desc"), limit(100))
    : query(stats, where("public", "==", true), orderBy("totalSeconds", "desc"), limit(100));
  const field = scope === "week" ? "weekSeconds" : "totalSeconds";
  return snapToList(await getDocs(q)).filter((s) => s[field] > 0);
}
