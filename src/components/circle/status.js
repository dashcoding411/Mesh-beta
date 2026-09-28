// What a circle lets you do, in words, for the page and the About tab.
import { BadgeCheck, Ban, Clock, Hourglass, Link2Off, Lock, UserCheck } from "lucide-react";
import { AUTOMOD_DEFAULTS, canJoinDirectly, isCircleMod, isMuted } from "../../lib/db";
import { clockTime, plural } from "../../lib/format";

/* Why you can or can't post here, in words. Mirrors circlePostOk in the rules. */
export function postingStatus(group, membership) {
  const automod = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) };
  if (!membership) return { ok: false, reason: "Join this circle to post in it." };
  if (isMuted(membership)) {
    return { ok: false, reason: `An admin has muted you here until ${clockTime(membership.mutedUntil.toMillis())}.` };
  }
  if (automod.postingPermission === "admins" && !isCircleMod(membership)) {
    return { ok: false, reason: "Only admins and moderators post in this circle. You can still comment and react." };
  }
  return { ok: true };
}

/* The limits a circle has switched on, as short chips anyone can read. */
export function activeLimits(group) {
  const a = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) };
  const out = [];
  if (group.ageLimit) out.push({ icon: BadgeCheck, label: `${group.ageLimit}+ only` });
  if (!canJoinDirectly(group)) out.push({ icon: UserCheck, label: "Admins approve new members" });
  if (a.postingPermission === "admins") out.push({ icon: Lock, label: "Only admins post" });
  if (a.requirePostApproval) out.push({ icon: Hourglass, label: "Posts are approved first" });
  if (a.blockLinks) out.push({ icon: Link2Off, label: "No links" });
  if (a.blockNewAccounts) out.push({ icon: Clock, label: "Accounts must be 7+ days old" });
  if ((a.bannedWords || []).length) out.push({ icon: Ban, label: `${plural(a.bannedWords.length, "blocked word")}` });
  return out;
}
