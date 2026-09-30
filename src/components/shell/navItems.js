import {
  House, Clapperboard, MessageCircle, Search, Blend, Newspaper, Bell, Settings, BrickWall, Bookmark, Trophy,
} from "lucide-react";
import { sidebarSection } from "../../lib/surfaces";

// Shared by the desktop sidebar and the mobile drawer. `badge` keys into the counts prop.
export const MAIN_NAV = [
  { id: "foryou", label: "Home", icon: House, path: "/" },
  { id: "flicks", label: "Flicks", icon: Clapperboard, path: "/flicks" },
  { id: "messages", label: "Messages", icon: MessageCircle, path: "/messages", badge: "unread" },
  { id: "search", label: "Search", icon: Search, path: "/search" },
  { id: "circles", label: "Circles", icon: Blend, path: "/circles" },
  { id: "news", label: "News", icon: Newspaper, path: "/news" },
  { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications", badge: "notifications" },
];

export const MORE_NAV = [
  { id: "settings", label: "Settings", icon: Settings, path: "/account/settings" },
  { id: "brick", label: "Brick mode", icon: BrickWall, path: "/account/brick" },
  { id: "saved", label: "Saved", icon: Bookmark, path: "/saved" },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy, path: "/leaderboard" },
];

export function activeNavId(page) {
  if (page.tab === "home") return ["saved", "leaderboard"].includes(page.section) ? page.section : sidebarSection(page.section);
  if (page.tab === "account") return { settings: "settings", brick: "brick", profile: "profile" }[page.view] || null;
  return page.tab;
}
