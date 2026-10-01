// Profile badges. Everyone who joined during the beta is a beta tester;
// admins can also award it (users/{uid}.badges) to later testers.
import { tsMillis } from "./db";

export const BETA_ENDS = Date.parse("2026-10-02T00:00:00+10:00");

export function badgesOf(profile) {
  const badges = new Set(profile?.badges || []);
  const joined = tsMillis(profile?.createdAt);
  if (joined && joined < BETA_ENDS) badges.add("beta");
  return [...badges];
}

/** Joined during the beta, so the badge comes with the account rather than an admin. */
export function betaByJoinDate(profile) {
  const joined = tsMillis(profile?.createdAt);
  return !!joined && joined < BETA_ENDS;
}
