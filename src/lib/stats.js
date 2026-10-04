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
