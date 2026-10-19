import {
  Heart, MessageCircle, Repeat2, UserPlus, AtSign, ShieldCheck, CalendarDays, Blend, UserCheck, Waves, Scale, Newspaper,
} from "lucide-react";
import { LogoMark } from "./shell/Sidebar";
import { plural } from "../lib/format";
import LiveAvatar from "./ui/LiveAvatar";

// Solid badges with white icons, so the photo never shows through.
const ACCENT = "bg-accent text-white";
const LIKE = "bg-fuchsia-600 text-white";
const GOOD = "bg-emerald-600 text-white";
const ASK = "bg-amber-600 text-white";
const ICONS = {
  like: { icon: Heart, className: LIKE },
  repost: { icon: Repeat2, className: GOOD },
  comment: { icon: MessageCircle, className: ACCENT },
  reply: { icon: MessageCircle, className: ACCENT },
  mention: { icon: AtSign, className: ACCENT },
  follow: { icon: UserPlus, className: ACCENT },
  request: { icon: UserPlus, className: ASK },
  accept: { icon: UserCheck, className: GOOD },
  family: { icon: ShieldCheck, className: ACCENT },
  familyok: { icon: ShieldCheck, className: GOOD },
  familyask: { icon: ShieldCheck, className: ASK },
  invite: { icon: CalendarDays, className: ACCENT },
  joined: { icon: Blend, className: GOOD },
  storylike: { icon: Heart, className: LIKE },
  echo: { icon: Waves, className: ACCENT },
  appeal: { icon: Scale, className: ACCENT },
  journalist: { icon: Newspaper, className: ACCENT },
};

/** The actor's photo with a small icon for what they did. */
export function NoticeAvatar({ n, size = 44 }) {
  const { icon: Icon, className } = ICONS[n.type] || ICONS.follow;
  const badge = Math.max(18, Math.round(size * 0.45));
  return (
    // inline-flex so the badge is placed against the photo, not the line of text.
    <span className="relative inline-flex shrink-0">
      {/* Appeal and application decisions come from Mesh, not the staff member who made them. */}
      {n.type === "appeal" || n.type === "journalist"
        ? <LogoMark size={size} />
        : <LiveAvatar uid={n.actorId} profile={{ username: n.actorName, photoURL: n.actorPhoto }} size={size} />}
      <span style={{ width: badge, height: badge }}
        className={`absolute -bottom-0.5 -right-1 flex items-center justify-center rounded-full ring-2 ring-canvas ${className}`}>
        <Icon size={Math.round(badge * 0.55)} strokeWidth={2.5} aria-hidden="true" fill={n.type === "like" || n.type === "storylike" ? "currentColor" : "none"} />
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
    journalist: n.text === "approved"
      ? <><strong className="font-semibold text-fg">Mesh</strong> approved you as a journalist. Set up your byline to start writing.</>
      : <><strong className="font-semibold text-fg">Mesh</strong> looked at your journalist application. See Settings for the outcome.</>,
  }[n.type] || <>{who} did something new. Reload Mesh to see what.</>;
}
