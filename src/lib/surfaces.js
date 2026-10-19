import {
  Sparkles, Users, Clapperboard, Newspaper, Blend, Search,
  House, MessageCircle, UserRound, Bell, Trophy, CalendarDays, Aperture, LifeBuoy,
} from "lucide-react";

// Product surfaces. Format names are Mesh's own: Stills (photos), Strands
// (text), Flicks (video), Circles (communities).

export const TABS = [
  { id: "home", path: "/", label: "Home", icon: House },
  { id: "messages", path: "/messages", label: "Messages", icon: MessageCircle },
  { id: "account", path: "/account", label: "Account", icon: UserRound },
];

const ALL = {
  search: { id: "search", path: "/search", label: "Search", icon: Search },
  foryou: { id: "foryou", path: "/", label: "For you", icon: Sparkles },
  flicks: { id: "flicks", path: "/flicks", label: "Flicks", icon: Clapperboard },
  circles: { id: "circles", path: "/circles", label: "Circles", icon: Blend },
  following: { id: "following", path: "/following", label: "Following", icon: Users },
  news: { id: "news", path: "/news", label: "News", icon: Newspaper },
  notifications: { id: "notifications", path: "/notifications", label: "Notifications", icon: Bell },
  leaderboard: { id: "leaderboard", path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  whatson: { id: "whatson", path: "/whats-on", label: "What's on", icon: CalendarDays },
  rolls: { id: "rolls", path: "/rolls", label: "Rolls", icon: Aperture },
  help: { id: "help", path: "/help", label: "Help", icon: LifeBuoy },
};

export const FEED_TABS = [ALL.foryou, ALL.following];

export const sectionById = (id) => ALL[id] || ALL.foryou;

/** Sidebar item for a section; feed tabs map to For you. */
export const sidebarSection = (id) => (id === "following" ? "foryou" : id === "whatson" ? "circles" : id);
