import {
  Heart, MessageCircle, Repeat2, UserPlus, AtSign, ShieldCheck, CalendarDays, Blend, UserCheck, Waves, Scale,
} from "lucide-react";
import { LogoMark } from "./shell/Sidebar";
import { plural } from "../lib/format";
import LiveAvatar from "./ui/LiveAvatar";

const ICONS = {
  like: { icon: Heart, className: "bg-like/15 text-like" },
  repost: { icon: Repeat2, className: "bg-success-text/15 text-success-text" },
  comment: { icon: MessageCircle, className: "bg-accent-soft text-accent-text" },
  reply: { icon: MessageCircle, className: "bg-accent-soft text-accent-text" },
  mention: { icon: AtSign, className: "bg-accent-soft text-accent-text" },
  follow: { icon: UserPlus, className: "bg-accent-soft text-accent-text" },
  request: { icon: UserPlus, className: "bg-warning-text/15 text-warning-text" },
  accept: { icon: UserCheck, className: "bg-success-text/15 text-success-text" },
  family: { icon: ShieldCheck, className: "bg-accent-soft text-accent-text" },
  familyok: { icon: ShieldCheck, className: "bg-success-text/15 text-success-text" },
  familyask: { icon: ShieldCheck, className: "bg-warning-text/15 text-warning-text" },
  invite: { icon: CalendarDays, className: "bg-accent-soft text-accent-text" },
  joined: { icon: Blend, className: "bg-success-text/15 text-success-text" },
  storylike: { icon: Heart, className: "bg-like/15 text-like" },
  echo: { icon: Waves, className: "bg-accent-soft text-accent-text" },
  appeal: { icon: Scale, className: "bg-accent-soft text-accent-text" },
};

/** The actor's photo with a small icon for what they did. */
export function NoticeAvatar({ n, size = 44 }) {
  const { icon: Icon, className } = ICONS[n.type] || ICONS.follow;
  return (
    <span className="relative shrink-0">
      {/* Appeal decisions come from Mesh, not the staff member who made them. */}
      {n.type === "appeal"
        ? <LogoMark size={size} />
        : <LiveAvatar uid={n.actorId} profile={{ username: n.actorName, photoURL: n.actorPhoto }} size={size} />}
      <span className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-canvas ${className}`}>
        <Icon size={13} strokeWidth={2.4} aria-hidden="true" fill={n.type === "like" || n.type === "storylike" ? "currentColor" : "none"} />
      </span>
    </span>
  );
}

/** What happened, in a sentence. `others` counts other people grouped with the actor. */
export function NoticeLine({ n, others = 0 }) {
  const who = <strong className="font-semibold text-fg">@{n.actorName}</strong>;
  const rest = others > 0 ? <> and {plural(others, "other")}</> : null;
  const quote = n.text ? <span className="text-fg-muted"> “{n.text}{n.text.length >= 140 ? "…" : ""}”</span> : null;
  return {
    like: <>{who}{rest} liked your post</>,
    repost: <>{who}{rest} reposted your post</>,
    comment: <>{who} commented:{quote}</>,
    reply: <>{who} replied to your comment:{quote}</>,
    mention: <>{who} mentioned you:{quote}</>,
    follow: <>{who} started following you</>,
    request: <>{who} asked to follow you</>,
    accept: <>{who} accepted your follow request</>,
    family: <>{who} wants to add parental controls to your account</>,
    familyok: <>{who} accepted parental controls</>,
    familyask: <>{who} asked you to change their limits{quote ? ":" : ""}{quote}</>,
    invite: <>{who} invited you to a gathering</>,
    joined: <>You&apos;re in: {who} let you into a circle</>,
    storylike: <>{who}{rest} liked your story</>,
    echo: <>{who} echoed your story:{quote}</>,
    appeal: n.text === "overturned"
      ? <><strong className="font-semibold text-fg">Mesh</strong> accepted your appeal. You can post it now, just as you wrote it.</>
      : <><strong className="font-semibold text-fg">Mesh</strong> looked at your appeal and the block stays. The rule it matched still applies.</>,
  }[n.type] || <>{who} did something new. Reload Mesh to see what.</>;
}
