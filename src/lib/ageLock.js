// After someone gives a birth year under 16, this device can't start a new
// sign-up for 30 days, so going back and typing an older year doesn't work.
// Logging in to an existing account still works.

const KEY = "mesh:age-lock";
export const LOCK_DAYS = 30;
const DAY = 86400000;

/** When the lock ends (ms), or 0 if this device isn't locked. */
export function ageLockedUntil(now = Date.now()) {
  try {
    const at = Number(localStorage.getItem(KEY) || 0);
    const until = at ? at + LOCK_DAYS * DAY : 0;
    return until > now ? until : 0;
  } catch { return 0; }
}

/** Set in the last two minutes: the sign-up that just ended should explain why. */
export function justAgeLocked(now = Date.now()) {
  try { return now - Number(localStorage.getItem(KEY) || 0) < 120000; } catch { return false; }
}

export function lockAge(now = Date.now()) {
  try { localStorage.setItem(KEY, String(now)); } catch { /* storage blocked */ }
}

/** Whether a four-digit birth year means under 16 this year (borderline years count as 16). */
export function underSixteen(year, now = new Date()) {
  const y = Number(year);
  return Number.isInteger(y) && String(year).length === 4 && y > now.getFullYear() - 16 && y <= now.getFullYear();
}
