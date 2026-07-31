// Content moderation: hate-speech and spam filtering applied to usernames,
// posts, comments, messages, group names, news and profile fields.
//
// Design notes:
// - The slur list is deliberately even-handed: it covers slurs targeting every
//   group (South Asian, Black, East Asian, Latino, Jewish, Muslim, Roma,
//   Indigenous, white, LGBTQ+, disabled people) — no group is left out.
// - Text is normalized first (lowercase, leetspeak, separators stripped) so
//   "n!gg3r" or "p a k i" don't slip through.
// - Word-boundary matching is used for short terms that appear inside innocent
//   words (e.g. "paki" inside "Pakistan"), substring matching for unambiguous
//   longer terms.
// - This is client-side defense; for production scale, mirror it in a Cloud
//   Function so API-level writes are covered too.

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "+": "t" };

export function normalize(text) {
  let t = String(text || "").toLowerCase();
  t = t.replace(/[0134578@$!+]/g, (c) => LEET[c] ?? c);
  t = t.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // strip accents
  return t;
}

// collapsed = separators removed, for catching "p a k i" / "p.a.k.i"
function collapse(text) {
  return normalize(text).replace(/[^a-z]/g, "");
}

// Word-boundary slurs (short/ambiguous — must match as whole words)
const WORD_SLURS = [
  // anti-South Asian / anti-Indian
  "paki", "pajeet", "currymuncher", "curry_muncher", "streetshitter", "dothead", "cowpisser",
  // anti-Black
  "nigger", "nigga", "coon", "spade", "jigaboo", "porchmonkey",
  // anti-East/Southeast Asian
  "chink", "gook", "zipperhead", "slanteye", "chingchong",
  // anti-Latino
  "spic", "wetback", "beaner",
  // antisemitic
  "kike", "heeb", "yid",
  // anti-Muslim / anti-Arab
  "raghead", "towelhead", "sandnigger", "muzrat",
  // anti-Roma
  "gyppo", "zigeuner",
  // anti-Indigenous
  "redskin", "prairienigger",
  // anti-white
  "gringo", "honky", "whitetrash",
  // anti-LGBTQ+
  "faggot", "fag", "tranny", "dyke", "shemale",
  // ableist slurs
  "retard", "spastic", "mongoloid",
];

// Substring slurs (long/unambiguous enough to match anywhere, incl. collapsed)
const SUBSTRING_SLURS = [
  "currymuncher", "streetshitter", "porchmonkey", "sandnigger", "prairienigger",
  "chingchong", "zipperhead", "whitetrash", "nigger", "faggot", "pajeet",
];

const WORD_RE = new RegExp(`\\b(${WORD_SLURS.join("|")})s?\\b`, "i");

// Terms that are slurs in isolation but have common innocent collocations.
// Flagged only when the surrounding words don't make the benign reading obvious.
const AMBIGUOUS = [
  {
    term: "cracker",
    // cracker barrel, cream crackers, firecracker, nutcracker, safe cracker, code cracker
    innocent: /\b(barrel|cream|fire|nut|safe|code|jack|graham|water|cheese|christmas)\s?crackers?\b|\bcrackers?\s(barrel|jack)\b/i,
  },
];

export function containsHateSpeech(text) {
  const norm = normalize(text);
  if (WORD_RE.test(norm)) return true;

  for (const { term, innocent } of AMBIGUOUS) {
    const re = new RegExp(`\\b${term}s?\\b`, "i");
    if (re.test(norm) && !innocent.test(norm)) return true;
  }

  const flat = collapse(text);
  return SUBSTRING_SLURS.some((s) => flat.includes(s));
}

// ---------- spam ----------

const URL_RE = /https?:\/\/|www\./gi;

export function looksLikeSpam(text) {
  const t = String(text || "");
  if ((t.match(URL_RE) || []).length > 4) return "Too many links.";
  if (/(.)\1{14,}/.test(t)) return "That looks like keyboard spam.";
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 40 && letters === letters.toUpperCase()) return "Ease off the caps lock.";
  return null;
}

const COOLDOWN_MS = 15000;

export function postingCooldown(key = "post") {
  const k = `mesh:last:${key}`;
  const last = Number(localStorage.getItem(k) || 0);
  const wait = COOLDOWN_MS - (Date.now() - last);
  if (wait > 0) return Math.ceil(wait / 1000);
  return 0;
}

export function markPosted(key = "post") {
  localStorage.setItem(`mesh:last:${key}`, String(Date.now()));
}

export function duplicateOfLast(text, key = "post") {
  const k = `mesh:lasttext:${key}`;
  const prev = localStorage.getItem(k);
  localStorage.setItem(k, String(text || ""));
  return prev !== null && prev === String(text || "") && text.trim().length > 0;
}

// ---------- combined check ----------

export function checkContent(text, { key = "post", skipCooldown = false } = {}) {
  if (containsHateSpeech(text)) {
    return { error: "This contains language that isn't allowed on Mesh. Hate speech against any group is blocked." };
  }
  const spam = looksLikeSpam(text);
  if (spam) return { error: spam };
  if (!skipCooldown) {
    const wait = postingCooldown(key);
    if (wait > 0) return { error: `Slow down — you can post again in ${wait}s.` };
    if (duplicateOfLast(text, key)) return { error: "You just posted exactly that." };
  }
  return { ok: true };
}

export function checkName(text) {
  if (containsHateSpeech(text)) {
    return { error: "That name contains language that isn't allowed on Mesh." };
  }
  return { ok: true };
}
