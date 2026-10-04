// Today's brief: five recent stories, then "you're done for today". Which
// stories you've opened is remembered on this device only, for two weeks.
import { dayStamp } from "./timeMeter";

export const BRIEF_SIZE = 5;
const RECENT_MS = 36 * 3600000;
const QUIET_MS = 3 * 86400000;
const KEEP_DAYS = 14;
const KEY = "mesh:news-read";

/**
 * Up to five stories: from the last 36 hours, or the last three days when
 * it's quiet. Live stories first, then newest, with at most two per topic
 * unless there aren't enough others.
 */
export function pickBrief(stories, now = Date.now(), at = (s) => s.publishedMs) {
  const sorted = stories.filter((s) => at(s) && at(s) <= now + 60000).sort((a, b) => at(b) - at(a));
  let pool = sorted.filter((s) => now - at(s) <= RECENT_MS);
  if (pool.length < 3) pool = sorted.filter((s) => now - at(s) <= QUIET_MS);
  const ordered = [...pool.filter((s) => s.live), ...pool.filter((s) => !s.live)];
  const out = [];
  const perTopic = new Map();
  for (const s of ordered) {
    const t = s.topic || "world";
    if ((perTopic.get(t) || 0) >= 2) continue;
    perTopic.set(t, (perTopic.get(t) || 0) + 1);
    out.push(s);
    if (out.length === BRIEF_SIZE) return out;
  }
  for (const s of ordered) {
    if (out.length === BRIEF_SIZE) break;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function readMap() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

/** Story ids opened on this device in the last two weeks. */
export function readStoryIds() {
  return new Set(Object.values(readMap()).flat());
}

export function markStoryRead(id, now = Date.now()) {
  if (!id) return;
  const map = readMap();
  const today = dayStamp(now);
  if ((map[today] || []).includes(id)) return;
  map[today] = [...(map[today] || []), id].slice(-200);
  const oldest = dayStamp(now - KEEP_DAYS * 86400000);
  for (const k of Object.keys(map)) if (k < oldest) delete map[k];
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage blocked */ }
}

/** Distinct stories opened on this device since `fromMs`. */
export function storiesReadSince(fromMs) {
  const from = dayStamp(fromMs);
  const ids = new Set();
  for (const [day, list] of Object.entries(readMap())) if (day >= from) list.forEach((id) => ids.add(id));
  return ids.size;
}
