import {
  House, Clapperboard, MessageCircle, Search, Blend, Newspaper, Bell, Settings, BrickWall, Trophy, LifeBuoy, ShieldCheck,
} from "lucide-react";
import { sidebarSection } from "../../lib/surfaces";

// Shared by the desktop sidebar and the mobile drawer. `badge` keys into the
// counts prop; `account` items are hidden when signed out; work accounts
// (staff) see only `work` items, Home becoming their moderation queue.
export const MAIN_NAV = [
  { id: "foryou", label: "Home", icon: House, path: "/", work: { label: "Moderation", icon: ShieldCheck } },
  { id: "search", label: "Search", icon: Search, path: "/search", work: true },
  { id: "flicks", label: "Flicks", icon: Clapperboard, path: "/flicks" },
  { id: "messages", label: "Messages", icon: MessageCircle, path: "/messages", badge: "unread", account: true },
  { id: "news", label: "News", icon: Newspaper, path: "/news" },
  { id: "circles", label: "Circles", icon: Blend, path: "/circles" },
  { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications", badge: "notifications", account: true, work: true },
];

export const MORE_NAV = [
  { id: "settings", label: "Settings", icon: Settings, path: "/account/settings", account: true, work: true },
  { id: "brick", label: "Brick mode", icon: BrickWall, path: "/account/brick", account: true },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy, path: "/leaderboard" },
  { id: "help", label: "Help", icon: LifeBuoy, path: "/help", work: true },
];

export const navFor = (items, guest, work = false) => (work
  ? items.filter((i) => i.work).map((i) => (typeof i.work === "object" ? { ...i, ...i.work } : i))
  : guest ? items.filter((i) => !i.account) : items);

export function activeNavId(page) {
  if (page.tab === "home") return page.section === "leaderboard" ? page.section : sidebarSection(page.section);
  if (page.tab === "account") return { settings: "settings", brick: "brick", week: "brick", stats: "settings", family: "settings", ads: "settings", archive: "profile", profile: "profile" }[page.view] || null;
  return page.tab;
}
