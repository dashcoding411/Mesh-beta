// What a circle lets you do, in words, for the page and the About tab.
import { BadgeCheck, Ban, Clock, Hourglass, Link2Off, Lock, UserCheck, PhoneOff, Timer, Type, ImageOff, ShieldAlert, Camera } from "lucide-react";
import { canJoinDirectly, effectiveAutomod, isCircleMod, isMuted } from "../../lib/db";
import { clockTime, plural } from "../../lib/format";

/* Why you can or can't post here, in words. Mirrors circlePostOk in the rules. */
export function postingStatus(group, membership) {
  const automod = effectiveAutomod(group);
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
  const a = effectiveAutomod(group);
  const out = [];
  if (group.ageLimit) out.push({ icon: BadgeCheck, label: `${group.ageLimit}+ only` });
  if (!canJoinDirectly(group)) out.push({ icon: UserCheck, label: "Admins approve new members" });
  if (a.postingPermission === "admins") out.push({ icon: Lock, label: "Only admins post" });
  if (a.requirePostApproval) out.push({ icon: Hourglass, label: "Posts are approved first" });
  if (a.linkAction === "block") out.push({ icon: Link2Off, label: "No links" });
  if (a.linkAction === "hold") out.push({ icon: Link2Off, label: "Links are reviewed first" });
  if (a.newAccountDays) {
    out.push({ icon: Clock, label: a.newAccountAction === "hold" ? `Accounts under ${a.newAccountDays} days reviewed first` : `Accounts ${a.newAccountDays}+ days old` });
  }
  if (a.holdNoPhoto) out.push({ icon: Camera, label: "No photo, reviewed first" });
  if (a.blockContactInfo) out.push({ icon: PhoneOff, label: "No phone numbers or emails" });
  if (a.minLength) out.push({ icon: Type, label: `${a.minLength}+ characters` });
  if (!a.mediaAllowed) out.push({ icon: ImageOff, label: "Words only" });
  if (a.declineRecentStrikes) out.push({ icon: ShieldAlert, label: "Removed posts pause posting" });
  if (a.slowModeMinutes) out.push({ icon: Timer, label: `Slow mode: ${a.slowModeMinutes} min` });
  if ((a.bannedWords || []).length) out.push({ icon: Ban, label: `${plural(a.bannedWords.length, "blocked word")}` });
  return out;
}
