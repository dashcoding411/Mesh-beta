import {
  House, Clapperboard, MessageCircle, Search, Blend, Newspaper, Bell, Settings, BrickWall, Trophy, LifeBuoy,
} from "lucide-react";
import { sidebarSection } from "../../lib/surfaces";

// Shared by the desktop sidebar and the mobile drawer. `badge` keys into the
// counts prop; `account` items are hidden when signed out.
export const MAIN_NAV = [
  { id: "foryou", label: "Home", icon: House, path: "/" },
  { id: "search", label: "Search", icon: Search, path: "/search" },
  { id: "flicks", label: "Flicks", icon: Clapperboard, path: "/flicks" },
  { id: "messages", label: "Messages", icon: MessageCircle, path: "/messages", badge: "unread", account: true },
  { id: "news", label: "News", icon: Newspaper, path: "/news" },
  { id: "circles", label: "Circles", icon: Blend, path: "/circles" },
  { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications", badge: "notifications", account: true },
];

export const MORE_NAV = [
  { id: "settings", label: "Settings", icon: Settings, path: "/account/settings", account: true },
  { id: "brick", label: "Brick mode", icon: BrickWall, path: "/account/brick", account: true },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy, path: "/leaderboard" },
  { id: "help", label: "Help", icon: LifeBuoy, path: "/help" },
];

export const navFor = (items, guest) => (guest ? items.filter((i) => !i.account) : items);

export function activeNavId(page) {
  if (page.tab === "home") return page.section === "leaderboard" ? page.section : sidebarSection(page.section);
  if (page.tab === "account") return { settings: "settings", brick: "brick", week: "brick", stats: "settings", family: "settings", ads: "settings", archive: "profile", profile: "profile" }[page.view] || null;
  return page.tab;
}
