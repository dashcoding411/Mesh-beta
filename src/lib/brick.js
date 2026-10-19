// Brick mode policy engine: weekly windows, daily caps per section, and
// instant bricks. Messages and calls are never locked.
//
// Tightening applies immediately; loosening waits 24h in `pending`. A parent
// can add a second layer to an under-18 account that only they can loosen;
// it lapses on 1 January of the year the teen turns 18.
//
// Mirrors the lock checks in firestore.rules so the UI can predict exactly
// what the server will allow.

import { serverTimestamp, Timestamp } from "firebase/firestore";

export const SECTIONS = [
  { id: "feed", label: "Feed", blurb: "Includes Search and Circles" },
  { id: "flicks", label: "Flicks" },
  { id: "news", label: "News" },
];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const SLOT_MINUTES = 30;
export const SLOTS = 48;
export const COOL_OFF_MS = 24 * 60 * 60 * 1000;
const DAY_KEYS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

export function emptyLayer() {
  return { slots: {}, caps: { feed: 0, flicks: 0, news: 0 }, until: 0, since: 0, windows: [] };
}

/** Sets an instant brick until `untilMs`, keeping `since` if one is already running. */
export function withBrickUntil(layer, untilMs, now = Date.now()) {
  if ((layer.until || 0) > now) return { ...layer, until: Math.max(layer.until, untilMs) };
  return { ...layer, until: untilMs, since: "now" };
}

// Time, in the zone the limits were set in

/** Minutes east of UTC for this device. */
export function deviceOffset(date = new Date()) {
  return -date.getTimezoneOffset();
}
export function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

/** Local clock parts at `ms` for a zone `offset` minutes east of UTC. */
export function localParts(ms, offset) {
  const d = new Date(ms + offset * 60000);
  const y = d.getUTCFullYear();
  return {
    year: y,
    dayOfYear: Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000) + 1,
    dow: ((d.getUTCDay() + 6) % 7) + 1, // 1 = Monday
    slot: d.getUTCHours() * 2 + (d.getUTCMinutes() >= 30 ? 1 : 0),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** Today's usage doc id, as computed by the rules. */
export function dayKey(ms, offset) {
  const p = localParts(ms, offset);
  return `${p.year}-${p.dayOfYear}`;
}

export function nextMidnight(ms, offset) {
  const p = localParts(ms, offset);
  return ms + (24 * 60 - p.minuteOfDay) * 60000 - (new Date(ms).getUTCSeconds() * 1000 + new Date(ms).getUTCMilliseconds());
}

// Windows <-> slots

/** Converts { days, from, to } windows (minutes) to half-hour slots per day. to <= from wraps past midnight. */
export function windowsToSlots(windows) {
  const days = DAY_KEYS.map(() => new Set());
  for (const w of windows || []) {
    const from = Math.round(w.from / SLOT_MINUTES);
    const to = Math.round(w.to / SLOT_MINUTES);
    for (const day of w.days || []) {
      const i = day - 1;
      if (to > from) for (let s = from; s < to; s++) days[i].add(s);
      else {
        for (let s = from; s < SLOTS; s++) days[i].add(s);
        for (let s = 0; s < to; s++) days[(i + 1) % 7].add(s);
      }
    }
  }
  const out = {};
  days.forEach((set, i) => { if (set.size) out[DAY_KEYS[i]] = [...set].sort((a, b) => a - b); });
  return out;
}

/** "10:00pm", "midnight". */
export function clockLabel(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m === 0) return "midnight";
  if (m === 720) return "noon";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** "Weekdays", "Every day", "Sat, Sun". */
export function daysLabel(days) {
  const set = [...new Set(days)].sort();
  const key = set.join("");
  if (key === "1234567") return "Every day";
  if (key === "12345") return "Weekdays";
  if (key === "67") return "Weekends";
  return set.map((d) => DAYS[d - 1]).join(", ");
}

export function windowLabel(w) {
  if (w.from === w.to) return `${daysLabel(w.days)}, all day`;
  return `${daysLabel(w.days)}, ${clockLabel(w.from)} to ${clockLabel(w.to)}`;
}

// Lock evaluation

export function parentActive(policy, now = Date.now()) {
  return !!policy?.parent && now < Date.UTC(policy.parent.untilYear, 0, 1);
}

function layerBricked(layer, parts, now) {
  if (!layer) return null;
  if (layer.until > now) return { reason: "instant", until: layer.until };
  if ((layer.slots?.[DAY_KEYS[parts.dow - 1]] || []).includes(parts.slot)) return { reason: "schedule" };
  return null;
}

/** Null if `section` ("feed" | "flicks" | "news" | "") is open at `now`, else { reason, by, ... }. */
export function lockState(policy, usage, section, now = Date.now()) {
  if (!policy) return null;
  const parts = localParts(now, policy.tzOffset || 0);
  const par = parentActive(policy, now);
  const own = layerBricked(policy.self, parts, now);
  if (own) return { ...own, by: "self" };
  const fromParent = par ? layerBricked(policy.parent, parts, now) : null;
  if (fromParent) return { ...fromParent, by: "parent" };
  if (!section) return null;
  const used = usage?.[section] || 0;
  const ownCap = policy.self?.caps?.[section] || 0;
  if (ownCap > 0 && used >= ownCap * 60) return { reason: "cap", by: "self", cap: ownCap };
  const parCap = par ? policy.parent?.caps?.[section] || 0 : 0;
  if (parCap > 0 && used >= parCap * 60) return { reason: "cap", by: "parent", cap: parCap };
  return null;
}

/** Effective daily cap for a section across both layers, or 0. */
export function capFor(policy, section, now = Date.now()) {
  const own = policy?.self?.caps?.[section] || 0;
  const par = parentActive(policy, now) ? policy.parent?.caps?.[section] || 0 : 0;
  if (!own) return par;
  if (!par) return own;
  return Math.min(own, par);
}

/** When `section` next opens; null if beyond a week. */
export function unlockAt(policy, usage, section, now = Date.now()) {
  if (!lockState(policy, usage, section, now)) return now;
  const offset = policy.tzOffset || 0;
  const today = dayKey(now, offset);
  let t = now;
  for (let i = 0; i < 8 * SLOTS + 4; i++) {
    const p = localParts(t, offset);
      let next = t + ((SLOT_MINUTES - (p.minuteOfDay % SLOT_MINUTES)) * 60000) - (t % 60000);
    for (const layer of [policy.self, parentActive(policy, t) ? policy.parent : null]) {
      if (layer?.until > t && layer.until < next) next = layer.until;
    }
    t = next;
    const used = dayKey(t, offset) === today ? usage : null; // caps reset at midnight
    if (!lockState(policy, used, section, t)) return t;
  }
  return null;
}

// Strictness (mirrors tighterOrSame in the rules)

function capNoLooser(a, b) {
  return a === b || (a > 0 && (b === 0 || a < b));
}

export function isTighterOrSame(next, prev, now = Date.now()) {
  for (const k of DAY_KEYS) {
    const had = prev.slots?.[k] || [];
    const has = new Set(next.slots?.[k] || []);
    if (!had.every((s) => has.has(s))) return false;
  }
  for (const s of SECTIONS) if (!capNoLooser(next.caps?.[s.id] || 0, prev.caps?.[s.id] || 0)) return false;
  return (next.until || 0) >= (prev.until || 0) || (prev.until || 0) <= now;
}

/** Union of slots, lower caps, later instant brick. */
export function tightest(a, b) {
  const slots = {};
  for (const k of DAY_KEYS) {
    const set = new Set([...(a.slots?.[k] || []), ...(b.slots?.[k] || [])]);
    if (set.size) slots[k] = [...set].sort((x, y) => x - y);
  }
  const caps = {};
  for (const s of SECTIONS) {
    const x = a.caps?.[s.id] || 0;
    const y = b.caps?.[s.id] || 0;
    caps[s.id] = !x ? y : !y ? x : Math.min(x, y);
  }
  const seen = new Set();
  const windows = [...(a.windows || []), ...(b.windows || [])].filter((w) => {
    const k = JSON.stringify([w.days, w.from, w.to]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const later = (a.until || 0) >= (b.until || 0) ? a : b;
  return { slots, caps, until: later.until || 0, since: later.since || 0, windows };
}

/** Applies the tightened parts of prev -> next to a pending `target`. */
export function carryTightening(target, prev, next) {
  const out = { ...target, slots: { ...(target.slots || {}) }, caps: { ...target.caps }, windows: [...(target.windows || [])] };
  for (const k of DAY_KEYS) {
    const had = new Set(prev.slots?.[k] || []);
    const added = (next.slots?.[k] || []).filter((s) => !had.has(s));
    if (added.length) out.slots[k] = [...new Set([...(out.slots[k] || []), ...added])].sort((a, b) => a - b);
  }
  for (const s of SECTIONS) {
    const n = next.caps?.[s.id] || 0;
    if (n !== (prev.caps?.[s.id] || 0)) {
      const t = out.caps[s.id] || 0;
      out.caps[s.id] = capNoLooser(n, t) ? n : t;
    }
  }
  const seen = new Set(out.windows.map((w) => JSON.stringify([w.days, w.from, w.to])));
  const before = new Set((prev.windows || []).map((w) => JSON.stringify([w.days, w.from, w.to])));
  for (const w of next.windows || []) {
    const k = JSON.stringify([w.days, w.from, w.to]);
    if (!before.has(k) && !seen.has(k)) out.windows.push(w);
  }
  if ((next.until || 0) > (prev.until || 0) && next.until > (target.until || 0)) {
    out.until = next.until;
    out.since = next.since;
  }
  return out;
}

/** Applies prev -> next onto a pending change so successive loosenings accumulate. */
export function applyChange(target, prev, next) {
  const key = (w) => JSON.stringify([w.days, w.from, w.to]);
  const before = new Set((prev.windows || []).map(key));
  const after = new Set((next.windows || []).map(key));
  const windows = (target.windows || []).filter((w) => !before.has(key(w)) || after.has(key(w)));
  const have = new Set(windows.map(key));
  for (const w of next.windows || []) if (!before.has(key(w)) && !have.has(key(w))) windows.push(w);
  const caps = { ...target.caps };
  for (const s of SECTIONS) {
    if ((next.caps?.[s.id] || 0) !== (prev.caps?.[s.id] || 0)) caps[s.id] = next.caps?.[s.id] || 0;
  }
  const later = (next.until || 0) > (target.until || 0) ? next : target;
  return { slots: windowsToSlots(windows), caps, until: later.until || 0, since: later.since || 0, windows };
}

/** Human-readable list of what a change loosens. */
export function looseningParts(next, prev, now = Date.now()) {
  const out = [];
  const nextKeys = new Set((next.windows || []).map((w) => JSON.stringify([w.days, w.from, w.to])));
  for (const w of prev.windows || []) {
    if (!nextKeys.has(JSON.stringify([w.days, w.from, w.to]))) out.push(`Remove "${windowLabel(w)}"`);
  }
  for (const s of SECTIONS) {
    const a = prev.caps?.[s.id] || 0;
    const b = next.caps?.[s.id] || 0;
    if (!capNoLooser(b, a)) out.push(b === 0 ? `No daily limit on ${s.label}` : `${s.label} from ${a} to ${b} minutes a day`);
  }
  if ((prev.until || 0) > now && (next.until || 0) < prev.until) out.push("End the brick early");
  if (!out.length && !isTighterOrSame(next, prev, now)) out.push("Unlock some scheduled times");
  return out;
}

// Serialisation

const toTs = (ms) => Timestamp.fromMillis(Math.max(0, ms || 0));
const fromTs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);

export function layerToDoc(layer) {
  return {
    slots: layer.slots || {},
    caps: { feed: layer.caps?.feed || 0, flicks: layer.caps?.flicks || 0, news: layer.caps?.news || 0 },
    until: toTs(layer.until),
    // "now" becomes a server timestamp.
    since: layer.since === "now" ? serverTimestamp() : toTs(layer.since),
    windows: (layer.windows || []).map((w) => ({ days: w.days, from: w.from, to: w.to })),
  };
}

export function slotsChanged(a, b) {
  return DAY_KEYS.some((k) => (a?.slots?.[k] || []).join() !== (b?.slots?.[k] || []).join());
}

export function layerFromDoc(d) {
  if (!d) return null;
  return {
    slots: d.slots || {},
    caps: { feed: d.caps?.feed || 0, flicks: d.caps?.flicks || 0, news: d.caps?.news || 0 },
    until: fromTs(d.until),
    since: fromTs(d.since),
    windows: d.windows || [],
  };
}

export function policyFromDoc(d) {
  if (!d) return null;
  return {
    tzOffset: d.tzOffset || 0,
    tzName: d.tzName || "",
    tzChangedAt: fromTs(d.tzChangedAt),
    slotsChangedAt: d.slotsChangedAt ? fromTs(d.slotsChangedAt) : null,
    self: layerFromDoc(d.self) || emptyLayer(),
    pending: d.pending ? {
      self: layerFromDoc(d.pending.self),
      requestedAt: fromTs(d.pending.requestedAt),
      tzOffset: d.pending.tzOffset,
      tzName: d.pending.tzName,
    } : null,
    parent: d.parent ? {
      ...layerFromDoc(d.parent),
      parentId: d.parent.parentId,
      parentName: d.parent.parentName,
      untilYear: d.parent.untilYear,
    } : null,
    parentRequest: d.parentRequest ? {
      self: layerFromDoc(d.parentRequest.self),
      note: d.parentRequest.note || "",
      unlink: !!d.parentRequest.unlink,
      at: fromTs(d.parentRequest.at),
    } : null,
  };
}

export function pendingDueAt(policy) {
  return policy?.pending ? policy.pending.requestedAt + COOL_OFF_MS : null;
}

export function hasAnyLimit(layer) {
  if (!layer) return false;
  return Object.values(layer.slots || {}).some((l) => l.length)
    || SECTIONS.some((s) => (layer.caps?.[s.id] || 0) > 0)
    || (layer.until || 0) > Date.now();
}
