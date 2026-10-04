// What's on: upcoming public gatherings, grouped by when they happen and
// filtered by the area people type (gathering locations are free text).

const DAY = 86400000;
// Gatherings stay listed for a few hours after they start.
export const STILL_ON_MS = 3 * 3600000;

const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);

/** "today" | "weekend" | "week" | "later" for a start time, in the device's time zone. */
export function whenGroup(startMs, now = Date.now()) {
  const today = startOfDay(now);
  const day = startOfDay(startMs);
  if (day <= today) return "today";
  const dow = new Date(now).getDay(); // 0 = Sunday
  // The coming Saturday and Sunday; on a Saturday, just Sunday is left.
  const toSat = dow === 6 ? 0 : (6 - dow + 7) % 7;
  const sat = startOfDay(today + toSat * DAY + 12 * 3600000);
  const sun = startOfDay(sat + DAY + 12 * 3600000);
  if (dow !== 0 && day >= sat && day <= sun) return "weekend";
  if (day < today + 7 * DAY) return "week";
  return "later";
}

export const GROUP_TITLES = { today: "Today", weekend: "This weekend", week: "In the next 7 days", later: "Later" };

/** Upcoming gatherings in [{ id, title, events }] order, empty groups left out. */
export function groupWhatsOn(events, now = Date.now(), startOf = (e) => e.startsMs) {
  const groups = { today: [], weekend: [], week: [], later: [] };
  for (const e of events) {
    const at = startOf(e);
    if (!at || at < now - STILL_ON_MS) continue;
    groups[whenGroup(at, now)].push(e);
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([id, list]) => ({ id, title: GROUP_TITLES[id], events: list.sort((a, b) => startOf(a) - startOf(b)) }));
}

const ONLINE = /^(https?:\/\/|online\b|zoom\b|discord\b|google meet\b)/i;
export const isOnline = (location) => ONLINE.test(String(location || "").trim());

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Whether a gathering's location matches the typed area ("" matches everything). */
export function inArea(location, area) {
  const a = norm(area);
  if (!a) return true;
  if (a === "online") return isOnline(location);
  return norm(location).includes(a);
}

/**
 * Up to `max` places to offer as quick picks: the town-like parts of the
 * locations ("Fortitude Valley, Brisbane" offers both), most common first.
 */
export function areaChoices(locations, max = 6) {
  const count = new Map();
  let online = 0;
  for (const loc of locations) {
    if (isOnline(loc)) { online += 1; continue; }
    const parts = String(loc || "").split(",").map((p) => p.trim())
      // Street numbers, postcodes, and long venue descriptions don't make good picks.
      .filter((p) => p.length >= 3 && p.length <= 30 && !/\d/.test(p) && !/^(australia|qld|nsw|vic|sa|wa|tas|nt|act)$/i.test(p));
    for (const p of new Set(parts.slice(-2))) count.set(p, (count.get(p) || 0) + 1);
  }
  const out = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p).slice(0, max);
  if (online) out.push("Online");
  return out;
}
