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
  search: { id: "search", path: "/search", label: "Search", icon: Search, blurb: "People, posts, news and circles" },
  foryou: { id: "foryou", path: "/", label: "For you", icon: Sparkles, blurb: "Flicks, Stills and Strands, ranked for you" },
  flicks: { id: "flicks", path: "/flicks", label: "Flicks", icon: Clapperboard, blurb: "Short ones to swipe, long ones to sit down with" },
  circles: { id: "circles", path: "/circles", label: "Circles", icon: Blend, blurb: "Communities and the gatherings they plan" },
  following: { id: "following", path: "/following", label: "Following", icon: Users, blurb: "Only people you follow, newest first" },
  news: { id: "news", path: "/news", label: "News", icon: Newspaper, blurb: "Verified journalists publishing their own stories" },
  notifications: { id: "notifications", path: "/notifications", label: "Notifications", icon: Bell, blurb: "Likes, comments, follows and invites" },
  leaderboard: { id: "leaderboard", path: "/leaderboard", label: "Leaderboard", icon: Trophy, blurb: "Who's kept Mesh bricked the longest" },
  whatson: { id: "whatson", path: "/whats-on", label: "What's on", icon: CalendarDays, blurb: "Public gatherings coming up" },
  rolls: { id: "rolls", path: "/rolls", label: "Rolls", icon: Aperture, blurb: "Everyone shoots, nobody looks, it develops at 9am" },
  help: { id: "help", path: "/help", label: "Help", icon: LifeBuoy, blurb: "Short guides to everything in Mesh, in plain words" },
};

export const FEED_TABS = [ALL.foryou, ALL.following];

export const sectionById = (id) => ALL[id] || ALL.foryou;

/** Sidebar item for a section; feed tabs map to For you. */
export const sidebarSection = (id) => (id === "following" ? "foryou" : id === "whatson" ? "circles" : id);
