// "Your week on Mesh": a Monday-to-now recap from your own records. Time on
// Mesh and stories read come from this device (lib/timeMeter.js,
// lib/newsBrief.js); nothing here is shared unless you share the card.
import { collection, getCountFromServer, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../firebase";
import { me, snapToList, tsMillis } from "./core.js";
import { fetchBrickStats, weekKeyFor } from "./brickStats.js";
import { deviceOffset } from "../brick.js";
import { readTime, secondsBetween } from "../timeMeter.js";
import { storiesReadSince } from "../newsBrief.js";

const DAY = 86400000;

/** Monday 00:00 of the week `ms` falls in, in the device's time zone. */
export function weekStartOf(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** "45 min", "3 h", "3 h 20 min"; under a minute is "0 min". */
export function durationLabel(seconds) {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** How this week's time compares with the same days last week, or "" with nothing to compare. */
export function comparedLabel(thisWeek, lastWeek) {
  if (!lastWeek || lastWeek < 600) return "";
  const diff = thisWeek - lastWeek;
  if (Math.abs(diff) < 300) return "About the same as last week";
  return `${durationLabel(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than last week`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The lines on the recap card, leaving out what didn't happen (except time on Mesh). */
export function recapRows(r) {
  const rows = [{ label: "Time on Mesh", value: durationLabel(r.timeSeconds), note: r.compared }];
  if (r.brickedSeconds > 0) rows.push({ label: "Locked by Brick mode", value: durationLabel(r.brickedSeconds) });
  if (r.gatherings.length) rows.push({ label: "Gatherings", value: plural(r.gatherings.length, "gathering", "gatherings"), note: r.gatherings.slice(0, 2).map((g) => g.title).join(", ") });
  if (r.posts) rows.push({ label: "Posted", value: plural(r.posts, "post", "posts") });
  if (r.newFollowers) rows.push({ label: "New followers", value: plural(r.newFollowers, "person", "people") });
  if (r.storiesRead) rows.push({ label: "News", value: plural(r.storiesRead, "story read", "stories read") });
  return rows;
}

export async function fetchWeekRecap(uid = me(), now = Date.now()) {
  const start = weekStartOf(now);
  const since = Timestamp.fromMillis(start);
  const time = readTime(uid);
  // Last week, the same days (Monday to today's weekday). Noon offsets keep
  // the day boundaries right across daylight saving changes.
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - start) / DAY) + 1;
  const thisWeek = secondsBetween(time, start, now + DAY);
  const lastWeek = secondsBetween(time, start - 7 * DAY + DAY / 2, start - 7 * DAY + days * DAY + DAY / 2);

  const count = (q) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);
  const [posts, followers, rsvps, stats] = await Promise.all([
    count(query(collection(db, "posts"), where("authorId", "==", uid), where("createdAt", ">=", since), orderBy("createdAt", "desc"))),
    count(query(collection(db, "users", uid, "followers"), where("createdAt", ">=", since))),
    getDocs(query(collection(db, "users", uid, "rsvps"), where("startsAt", ">=", since), orderBy("startsAt", "asc"), limit(50)))
      .then(snapToList).catch(() => []),
    fetchBrickStats(uid).catch(() => null),
  ]);
  const gatherings = rsvps.filter((r) => r.status === "going" && tsMillis(r.startsAt) <= now);
  const week = weekKeyFor(now, deviceOffset());

  return {
    start,
    end: now,
    timeSeconds: thisWeek,
    compared: comparedLabel(thisWeek, lastWeek),
    brickedSeconds: stats?.weekKey === week ? stats.weekSeconds || 0 : 0,
    posts,
    newFollowers: followers,
    gatherings: gatherings.map((g) => ({ id: g.id, title: g.title || "A gathering" })),
    storiesRead: storiesReadSince(start),
  };
}
