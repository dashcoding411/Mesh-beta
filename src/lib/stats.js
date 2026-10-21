// Staff stats from activity records ({ joined, last, days } in ms and day
// offsets since joining). Pure, so the numbers can be tested.

const DAY = 86400000;
const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);

/** People active today, in the last 7 days and in the last 30 days, plus stickiness (daily / monthly). */
export function activeCounts(records, now = Date.now()) {
  const today = startOfDay(now);
  const n = (from) => records.filter((r) => r.last >= from).length;
  const daily = n(today);
  const weekly = n(today - 6 * DAY);
  const monthly = n(today - 29 * DAY);
  return { daily, weekly, monthly, stickiness: monthly ? Math.round((daily / monthly) * 100) : null };
}

/**
 * Of the people who joined since `since` (when counting began) and long
 * enough ago to tell, the share who came back: the next day (day 1), in their
 * second week (days 7 to 13), and a month on (day 30 or later).
 */
export function retention(records, now = Date.now(), since = 0) {
  const measure = (minAge, came) => {
    const eligible = records.filter((r) => r.joined && r.joined >= since && now - r.joined >= minAge * DAY);
    if (!eligible.length) return { rate: null, of: 0 };
    const back = eligible.filter((r) => (r.days || []).some(came)).length;
    return { rate: Math.round((back / eligible.length) * 100), of: eligible.length };
  };
  return {
    day1: measure(2, (d) => d === 1),
    week2: measure(14, (d) => d >= 7 && d <= 13),
    month: measure(31, (d) => d >= 30),
  };
}

/** Sign-ups per day for the last `days` days, oldest first: [{ day: ms, count }]. */
export function signupsByDay(createdMs, now = Date.now(), days = 30) {
  const today = startOfDay(now);
  const out = Array.from({ length: days }, (_, i) => ({ day: startOfDay(today - (days - 1 - i) * DAY + 12 * 3600000), count: 0 }));
  const index = new Map(out.map((b, i) => [b.day, i]));
  for (const ms of createdMs) {
    const i = index.get(startOfDay(ms));
    if (i !== undefined) out[i].count += 1;
  }
  return out;
}

/**
 * Possible fake crowds: posts that got at least `min` likes, comments or
 * reposts from accounts under a week old (lib/fresh.js) within `windowMs`.
 * `records` are [{ postId, kind, at }]. Busiest first, each with its busiest
 * window: { postId, count, kinds: { like: n, … }, from, to }.
 */
export function freshBursts(records, { windowMs = 3600000, min = 8 } = {}) {
  const byPost = new Map();
  for (const r of records) {
    if (!r.postId || !r.at) continue;
    if (!byPost.has(r.postId)) byPost.set(r.postId, []);
    byPost.get(r.postId).push(r);
  }
  const out = [];
  for (const [postId, list] of byPost) {
    list.sort((a, b) => a.at - b.at);
    let best = null;
    for (let i = 0, j = 0; j < list.length; j++) {
      while (list[j].at - list[i].at > windowMs) i++;
      if (!best || j - i + 1 > best.count) best = { count: j - i + 1, i, j };
    }
    if (best.count < min) continue;
    const kinds = {};
    for (const r of list.slice(best.i, best.j + 1)) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    out.push({ postId, count: best.count, kinds, from: list[best.i].at, to: list[best.j].at });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Text reduced to its words, for spotting the same message from many accounts. */
// Dots, colons and slashes stay inside links ("site.com/x"), not at the end of words.
export const sameText = (t) => String(t || "").toLowerCase().normalize("NFKC")
  .replace(/[.:/](?![\p{L}\p{N}])/gu, " ").replace(/[^\p{L}\p{N}:/.]+/gu, " ").trim();

/**
 * Texts posted by `min` or more different accounts, as
 * [{ text, accounts, count, postIds }], most accounts first. Short ones
 * ("congrats!") are left out: everyone writes those.
 */
export function copyClusters(items, { min = 3, minLength = 20 } = {}) {
  const groups = new Map();
  for (const it of items) {
    const key = sameText(it.text);
    if (key.length < minLength || !it.authorId) continue;
    if (!groups.has(key)) groups.set(key, { text: it.text, authors: new Set(), count: 0, postIds: new Set() });
    const g = groups.get(key);
    g.authors.add(it.authorId);
    g.count += 1;
    if (it.postId) g.postIds.add(it.postId);
  }
  return [...groups.values()]
    .filter((g) => g.authors.size >= min)
    .map((g) => ({ text: g.text, accounts: g.authors.size, count: g.count, postIds: [...g.postIds] }))
    .sort((a, b) => b.accounts - a.accounts);
}

/** Stretches where `min` or more accounts joined within `windowMs`, as [{ from, to, count }], busiest first. */
export function signupBursts(times, { windowMs = 600000, min = 15 } = {}) {
  const t = times.filter(Boolean).sort((a, b) => a - b);
  const out = [];
  let i = 0;
  while (i < t.length) {
    let j = i;
    while (j + 1 < t.length && t[j + 1] - t[i] <= windowMs) j++;
    const count = j - i + 1;
    if (count >= min) {
      out.push({ from: t[i], to: t[j], count });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
