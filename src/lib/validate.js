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
  // Minimum age 13, also enforced by the rules (validBirthYear).
  if (y > now - 13) return { error: "You need to be at least 13 to use Mesh." };
  return { year: y };
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

