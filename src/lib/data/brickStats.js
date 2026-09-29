// Brick stats: how long you've kept Mesh bricked, and the leaderboard.
//
// Only time the server itself enforced counts, and the rules check every
// claim against your limits: a finished instant brick counts once, for
// exactly as long as it ran; a whole past day counts its scheduled time,
// as long as the schedule didn't change that day. Private unless you opt in.

import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList } from "./core.js";
import { fetchProfile } from "./users.js";
import { localParts } from "../brick.js";

const statsRef = (uid) => doc(db, "brickStats", uid);
const DAY = 86400000;

/** The Monday that starts this local week, as the rules name it. */
export function weekKeyFor(ms, offset) {
  const monday = localParts(ms - (localParts(ms, offset).dow - 1) * DAY, offset);
  return `${monday.year}-${monday.dayOfYear}`;
}

/** Local midnight at the start of the day containing `ms`, as a UTC time. */
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

/* Bring your stats up to date: start them if needed, then count a finished
   instant brick and any whole days of scheduled time since last time. Each
   claim is its own write, which the rules check. Returns the stats. */
export async function syncBrickStats(policy, raw) {
  if (!policy || !raw) return null;
  const offset = policy.tzOffset || 0;
  const profile = await fetchProfile(me());
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

  // A finished instant brick, not yet counted.
  const until = raw.self.until?.toMillis?.() || 0;
  const since = raw.self.since?.toMillis?.() || until;
  if (until > (stats.instantUntil?.toMillis?.() || 0) && until <= now) {
    // Whole seconds, cut down as the server counts them (39.8s is 39).
    const secs = Math.floor((until - since) / 1000);
    await write({ ...pick(stats), totalSeconds: stats.totalSeconds + secs, weekSeconds: base() + secs, instantUntil: raw.self.until })
      .catch(() => {});
  }

  // Whole past days of scheduled time, from the last one counted.
  const changed = policy.slotsChangedAt;
  if (changed) {
    const today = localMidnight(now, offset);
    // From the day after the last one counted, but never a day the schedule
    // changed during, and at most a week back.
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

  // A new week with nothing counted yet starts from zero.
  if (stats.weekKey !== week) await write({ ...pick(stats), weekSeconds: 0 }).catch(() => {});
  return stats;
}

const pick = (s) => ({
  public: s.public, totalSeconds: s.totalSeconds, weekSeconds: s.weekSeconds, streakDays: s.streakDays,
  instantUntil: s.instantUntil, scheduleDay: s.scheduleDay,
});

/** Show (or stop showing) your bricked time on your profile and the leaderboard. */
export async function setStatsPublic(policy, on) {
  const stats = await fetchBrickStats();
  if (!stats) return;
  const profile = await fetchProfile(me());
  const week = weekKeyFor(Date.now(), policy?.tzOffset || 0);
  await setDoc(statsRef(me()), {
    ...pick(stats), public: on, ...card(profile),
    weekKey: week, weekSeconds: stats.weekKey === week ? stats.weekSeconds : 0,
    updatedAt: serverTimestamp(),
  });
}

/** Everyone who's opted in, ranked by this week (only entries counted
    this week) or by all time. */
export async function fetchLeaderboard(scope, week) {
  const list = snapToList(await getDocs(query(collection(db, "brickStats"), where("public", "==", true), limit(300))));
  if (scope === "week") return list.filter((s) => s.weekKey === week && s.weekSeconds > 0).sort((a, b) => b.weekSeconds - a.weekSeconds);
  return list.filter((s) => s.totalSeconds > 0).sort((a, b) => b.totalSeconds - a.totalSeconds);
}
