import { Bell, Menu, Plus, Search } from "lucide-react";
import IconButton from "../ui/IconButton";
import { sectionById } from "../../lib/surfaces";
import { navigate } from "../../lib/router";
import { useShell } from "./ShellContext";
import { LogoMark } from "./Sidebar";

// Home section header. Mobile adds drawer, search and create buttons;
// `children` renders below on both (e.g. feed tabs).
export default function HomeHeader({ section, children, actions, transparent = false }) {
  const { openDrawer, openComposer, noticesUnread } = useShell();
  const meta = sectionById(section);
  const isFeed = section === "foryou" || section === "following";

  return (
    <header className={`top-0 z-nav shrink-0 ${
      transparent
        ? "absolute inset-x-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent text-white md:sticky md:bg-canvas/90 md:bg-none md:text-fg md:backdrop-blur md:border-b md:border-line"
        : "sticky border-b border-line bg-canvas/90 backdrop-blur"
    }`}>
      <div className="flex h-14 items-center gap-1 px-2 pt-safe md:hidden">
        <IconButton icon={Menu} label="Open Home sections" onClick={openDrawer} tone={transparent ? "overlay" : "ghost"} />
        <div className="min-w-0 flex-1 px-1">
          {isFeed ? (
            <h1 className="flex items-center gap-2">
              <LogoMark size={26} />
              <span className="font-display text-title-2 font-extrabold tracking-tight">Mesh</span>
              <span className="sr-only">: {meta.label}</span>
            </h1>
          ) : (
            <h1 className="truncate text-title-3">{meta.label}</h1>
          )}
        </div>
        {section !== "search" && (
          <IconButton icon={Search} label="Search" onClick={() => navigate("/search")} tone={transparent ? "overlay" : "ghost"} />
        )}
        {section !== "notifications" && (
          <span className="relative">
            <IconButton icon={Bell} label={noticesUnread > 0 ? `Notifications, ${noticesUnread} new` : "Notifications"}
              onClick={() => navigate("/notifications")} tone={transparent ? "overlay" : "ghost"} />
            {noticesUnread > 0 && (
              <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-canvas" />
            )}
          </span>
        )}
        {actions}
        <IconButton icon={Plus} label="Create" onClick={() => openComposer()} tone={transparent ? "overlay" : "ghost"} />
      </div>

      <div className="hidden md:flex min-h-16 items-center gap-4 px-6">
        <div className="min-w-0 flex-1 py-3">
          <h1 className="text-title-2">{isFeed ? "Home" : meta.label}</h1>
          <p className="text-caption text-fg-subtle">{meta.blurb}</p>
        </div>
        {actions}
      </div>

      {children}
    </header>
  );
}
