// Profile badges. A few accounts have their own; everyone who joined during the
// beta is a beta tester, and admins can award that (users/{uid}.badges) to
// later testers.
import { tsMillis } from "./db";

export const BETA_ENDS = Date.parse("2026-10-02T00:00:00+10:00");

export const FOUNDER_UID = "8mqBWdkKGzabDf4gFeTWEK1GP3J2";

const PERSONAL = {
  "8mqBWdkKGzabDf4gFeTWEK1GP3J2": "founder", // @the_admin
  HVlA1t8sbMTuq1ggBA8akPCEEqg2: "cofounder", // @noah
  He6jJwIoVHg2qBqtKQb3dUIGAu83: "queen", // @clementine
};

export function badgesOf(profile) {
  const badges = new Set(profile?.badges || []);
  const joined = tsMillis(profile?.createdAt);
  if (joined && joined < BETA_ENDS) badges.add("beta");
  if (PERSONAL[profile?.id]) badges.add(PERSONAL[profile.id]);
  return [...badges];
}

/** Admins verify accounts (users/{uid}.badges), shown as a purple tick. */
export const isVerified = (badges) => !!badges?.includes("verified");

/**
 * Girlfriend privilege, which only the founder gives, to one account at a
 * time ('pink' in badges): a pink check in place of the purple tick, a pink
 * profile and a pink banner behind the profile photo.
 */
export const hasPinkCheck = (badges) => !!badges?.includes("pink");

/** Which tick goes beside a name: "pink", "verified" or null. */
export const tickOf = (badges) => (hasPinkCheck(badges) ? "pink" : isVerified(badges) ? "verified" : null);

/** Joined during the beta, so the badge comes with the account rather than an admin. */
export function betaByJoinDate(profile) {
  const joined = tsMillis(profile?.createdAt);
  return !!joined && joined < BETA_ENDS;
}
