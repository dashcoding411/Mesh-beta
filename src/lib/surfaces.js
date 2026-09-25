import {
  Sparkles, Users, Clapperboard, Newspaper, Blend, Search, Bookmark,
  House, MessageCircle, UserRound,
} from "lucide-react";

/* Names are our own: "Shorts" is YouTube's, "Groups" is Facebook's.
   Flicks covers all video: short clips play in full, long videos play a
   trailer and open into the full-length player. Stills are photos, Strands
   are words, Circles are communities.

   Navigation has three levels on purpose:
     - three tabs that are always there: Home, Messages, Account
     - four sections of Home in its sidebar: Search, For you, Flicks, Circles
     - the feed's own tabs: For you, Following, News
   so neither the bottom bar nor the sidebar grows past what's easy to scan. */

export const TABS = [
  { id: "home", path: "/", label: "Home", icon: House },
  { id: "messages", path: "/messages", label: "Messages", icon: MessageCircle },
  { id: "account", path: "/account", label: "Account", icon: UserRound },
];

const ALL = {
  search: { id: "search", path: "/search", label: "Search", icon: Search, blurb: "People, posts, news and circles" },
  foryou: { id: "foryou", path: "/", label: "For you", icon: Sparkles, blurb: "Flicks, Stills and Strands, ranked for you" },
  flicks: { id: "flicks", path: "/flicks", label: "Flicks", icon: Clapperboard, blurb: "Short videos, and trailers for long ones" },
  circles: { id: "circles", path: "/circles", label: "Circles", icon: Blend, blurb: "Communities and the gatherings they plan" },
  following: { id: "following", path: "/following", label: "Following", icon: Users, blurb: "Only people you follow, newest first" },
  news: { id: "news", path: "/news", label: "News", icon: Newspaper, blurb: "Stories reviewed against their sources" },
  saved: { id: "saved", path: "/saved", label: "Saved", icon: Bookmark, blurb: "Posts you've kept. Only you see these" },
};

/** The Home sidebar, in this order. */
export const HOME_SECTIONS = [ALL.search, ALL.foryou, ALL.flicks, ALL.circles];

/** Tabs across the top of the feed. News lives here as its own page. */
export const FEED_TABS = [ALL.foryou, ALL.following, ALL.news];

export const sectionById = (id) => ALL[id] || ALL.foryou;

/** Which sidebar row lights up for a section: the feed's tabs all count as For you. */
export const sidebarSection = (id) => (["following", "news", "saved"].includes(id) ? "foryou" : id);
