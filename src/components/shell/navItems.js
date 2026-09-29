import {
  House, Clapperboard, MessageCircle, Search, Blend, Newspaper, Bell, Settings, BrickWall, Bookmark,
} from "lucide-react";
import { sidebarSection } from "../../lib/surfaces";

/* One list of where you can go, shared by the desktop sidebar and the phone
   drawer so the two never drift apart. `badge` names the count shown on it. */
export const MAIN_NAV = [
  { id: "foryou", label: "Home", icon: House, path: "/" },
  { id: "flicks", label: "Flicks", icon: Clapperboard, path: "/flicks" },
  { id: "messages", label: "Messages", icon: MessageCircle, path: "/messages", badge: "unread" },
  { id: "search", label: "Search", icon: Search, path: "/search" },
  { id: "circles", label: "Circles", icon: Blend, path: "/circles" },
  { id: "news", label: "News", icon: Newspaper, path: "/news" },
  { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications", badge: "notifications" },
];

/* The less-used places, behind More on desktop and at the foot of the drawer. */
export const MORE_NAV = [
  { id: "settings", label: "Settings", icon: Settings, path: "/account/settings" },
  { id: "brick", label: "Brick mode", icon: BrickWall, path: "/account/brick" },
  { id: "saved", label: "Saved", icon: Bookmark, path: "/saved" },
];

/** Which item lights up for the page on screen. */
export function activeNavId(page) {
  if (page.tab === "home") return page.section === "saved" ? "saved" : sidebarSection(page.section);
  if (page.tab === "account") return { settings: "settings", brick: "brick", profile: "profile" }[page.view] || null;
  return page.tab;
}
