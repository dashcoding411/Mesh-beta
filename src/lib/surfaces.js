import {
  Sparkles, Users, Clapperboard, Newspaper, Blend, Search, Bookmark,
  House, MessageCircle, UserRound,
} from "lucide-react";

/* Names are our own: "Shorts" is YouTube's, "Groups" is Facebook's.
   Flicks covers all video: short clips play in full, long videos play a
   trailer and open into the full-length player. Stills are photos, Strands
   are words, Circles are communities.

   Navigation has two levels on purpose:
     - three tabs that are always there: Home, Messages, Account
     - everything else is a section of Home, reached from its sidebar
   so the bottom bar never grows past what a thumb can reach. */

export const TABS = [
  { id: "home", path: "/", label: "Home", icon: House },
  { id: "messages", path: "/messages", label: "Messages", icon: MessageCircle },
  { id: "account", path: "/account", label: "Account", icon: UserRound },
];

export const HOME_SECTIONS = [
  { id: "foryou", path: "/", label: "For you", icon: Sparkles, blurb: "Flicks, Stills and Strands, ranked for you" },
  { id: "following", path: "/following", label: "Following", icon: Users, blurb: "Only people you follow, newest first" },
  { id: "flicks", path: "/flicks", label: "Flicks", icon: Clapperboard, blurb: "Short videos, and trailers for long ones" },
  { id: "news", path: "/news", label: "News", icon: Newspaper, blurb: "Stories reviewed against their sources" },
  { id: "circles", path: "/circles", label: "Circles", icon: Blend, blurb: "Communities and their gatherings" },
  { id: "search", path: "/search", label: "Search", icon: Search, blurb: "People, posts, news and circles" },
  { id: "saved", path: "/saved", label: "Saved", icon: Bookmark, blurb: "Posts you've kept. Only you see these" },
];

export const sectionById = (id) => HOME_SECTIONS.find((s) => s.id === id) || HOME_SECTIONS[0];
