import { tsMillis } from "./db";

const toDate = (t) => new Date(typeof t === "number" ? t : tsMillis(t) || Date.now());

/** "now", "5m", "3h", "4d", then "12 Mar", then "12 Mar 2024". Compact for headers. */
export function shortTime(t) {
  const d = toDate(t);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago". For sentences. */
export function relativeTime(t) {
  const s = (Date.now() - toDate(t).getTime()) / 1000;
  if (s < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

/** The full date and time, for title attributes and screen readers. */
export function fullTime(t) {
  return toDate(t).toLocaleString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function isoTime(t) {
  return toDate(t).toISOString();
}

/** 1450 → "24:10", 3725 → "1:02:05". */
export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** "24 min", "1 hr 5 min", for sentences and labels. */
export function spokenDuration(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/** Message-list day separators: "Today", "Yesterday", "Monday", "12 March". */
export function dayLabel(t) {
  const d = toDate(t);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "long", ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function clockTime(t) {
  return toDate(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** 1234 → "1.2K". Big counts shouldn't push an action row around. */
export function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "7:00am", "tomorrow at 7:00am", "Friday at 7:00am", in this device's time. */
export function whenLabel(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  const day = (t) => new Date(t).toDateString();
  if (day(ms) === day(now)) return time;
  if (day(ms) === day(now + 86400000)) return `tomorrow at ${time}`;
  if (ms - now < 6 * 86400000) return `${d.toLocaleDateString(undefined, { weekday: "long" })} at ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${time}`;
}

/** "2h 14m", "45m", "under a minute". */
export function spanLabel(ms) {
  if (ms < 60000) return "under a minute";
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
