// Client-side validation mirroring the limits in firestore.rules/storage.rules.

export const LIMITS = {
  username: { min: 3, max: 30 },
  bio: 300,
  text: 5000,
  title: 150,
  alt: 500,
  comment: 2000,
  groupName: { min: 3, max: 80 },
  groupDescription: 1000,
  eventTitle: { min: 3, max: 150 },
  eventDescription: 2000,
  eventLocation: 300,
  imageBytes: 10 * 1024 * 1024, // 10 MB
  videoBytes: 200 * 1024 * 1024, // 200 MB
  newsTitle: { min: 10, max: 200 },
  newsScript: { min: 100, max: 20000 },
  newsSources: { min: 2, max: 10 },
  message: 2000,
  chatName: { min: 2, max: 60 },
  pronouns: 40,
  town: 80,
};

const URL_ONLY_RE = /^https?:\/\/\S+\.\S+/;

export function validateSources(raw) {
  const sources = String(raw || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sources.length < LIMITS.newsSources.min) {
    return { error: `News needs at least ${LIMITS.newsSources.min} sources (one URL per line).` };
  }
  if (sources.length > LIMITS.newsSources.max) {
    return { error: `Max ${LIMITS.newsSources.max} sources.` };
  }
  for (const s of sources) {
    if (!URL_ONLY_RE.test(s)) return { error: `"${s.slice(0, 40)}" isn't a valid URL. Sources must be links.` };
  }
  return { sources };
}

export function validBirthYear(raw) {
  const y = Number(raw);
  const now = new Date().getFullYear();
  if (!Number.isInteger(y) || y < now - 120 || y > now) {
    return { error: "Enter a real birth year." };
  }
  // Minimum age 16 (Online Safety Amendment (Social Media Minimum Age) Act
  // 2024), also enforced by the rules (validBirthYear). Someone born 16
  // years ago may not have had their birthday yet, so that year is
  // `borderline` and the sign-up form asks.
  if (y > now - 16) return { error: "Mesh is for people 16 and over." };
  return { year: y, borderline: y === now - 16 };
}

const USERNAME_RE = /^[a-z0-9_]+$/;

export function validateUsername(raw) {
  const username = String(raw || "").trim().toLowerCase();
  if (username.length < LIMITS.username.min || username.length > LIMITS.username.max) {
    return { error: `Username must be ${LIMITS.username.min}–${LIMITS.username.max} characters.` };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: "Username can only contain lowercase letters, numbers and underscores." };
  }
  return { username };
}

export function validateText(raw, max, label = "Text") {
  const text = String(raw || "").trim();
  if (text.length > max) return { error: `${label} is too long (max ${max} characters).` };
  return { text };
}

export function validateMediaFile(file, kind) {
  if (!file) return { error: "No file selected." };
  if (kind === "image") {
    if (!file.type.startsWith("image/")) return { error: "Please choose an image file." };
    if (file.size > LIMITS.imageBytes) return { error: "Images must be under 10 MB." };
  } else {
    if (!file.type.startsWith("video/")) return { error: "Please choose a video file." };
    if (file.size > LIMITS.videoBytes) return { error: "Videos must be under 200 MB." };
  }
  return { ok: true };
}

// The passwords attackers try first. Not exhaustive: length does most of the work.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890", "123123123", "11111111",
  "00000000", "qwertyui", "qwertyuiop", "qwerty123", "asdfghjk", "asdfghjkl", "zxcvbnm1", "iloveyou", "iloveyou1",
  "abc12345", "abcd1234", "1q2w3e4r", "1qaz2wsx", "letmein1", "welcome1", "welcome123", "football", "baseball",
  "sunshine", "princess", "dragon12", "monkey12", "superman", "starwars", "whatever", "trustno1", "mesh1234", "meshmesh",
  "joinmesh", "australia", "brisbane", "melbourne", "sydney123", "changeme", "default1", "admin123", "administrator",
]);

/** A reason the password isn't good enough, or "". */
export function passwordProblem(password, { username = "", email = "" } = {}) {
  const p = String(password || "");
  // Matches the Firebase Auth password policy: 8+ with an uppercase letter, a number and a symbol.
  if (p.length < 8) return "Use at least 8 characters.";
  if (p.length > 128) return "That's too long. Use 128 characters or fewer.";
  if (!/[A-Z]/.test(p)) return "Add an uppercase letter.";
  if (!/[0-9]/.test(p)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(p)) return "Add a symbol, like ! or #.";
  const lower = p.toLowerCase();
  // "Password1!" is still "password": compare the letters alone too.
  const letters = lower.replace(/[^a-z]/g, "");
  const commonWord = [...COMMON_PASSWORDS].some((c) => c.replace(/[^a-z]/g, "") === letters && letters.length >= 4);
  if (COMMON_PASSWORDS.has(lower) || commonWord || /^(.)\1+$/.test(p)) return "That's one of the most common passwords. Choose something harder to guess.";
  const handle = String(username || "").toLowerCase();
  const local = String(email || "").toLowerCase().split("@")[0];
  if ((handle.length >= 4 && lower.includes(handle)) || (local.length >= 4 && lower.includes(local))) {
    return "Don't use your handle or email in your password.";
  }
  return "";
}
