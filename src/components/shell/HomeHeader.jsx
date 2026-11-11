import { Aperture, Bell, Menu, Plus, Search } from "lucide-react";
import IconButton from "../ui/IconButton";
import { sectionById } from "../../lib/surfaces";
import { authPath, navigate } from "../../lib/router";
import { useShell } from "./ShellContext";
import { LogoMark } from "../ui/LogoMark";

// Home section header. Mobile adds drawer, search and create buttons;
// `children` renders below on both (e.g. feed tabs).
export default function HomeHeader({ section, children, actions, transparent = false }) {
  const { openDrawer, openComposer, noticesUnread, guest, rollsDot, workAccount } = useShell();
  const meta = sectionById(section);
  const isFeed = section === "foryou" || section === "following";

  return (
    <header className={`top-0 z-nav shrink-0 ${
      transparent
        ? "absolute inset-x-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent text-white md:sticky md:bg-canvas/90 md:bg-none md:text-fg md:backdrop-blur md:border-b md:border-line"
        : `sticky bg-canvas/90 backdrop-blur glass-solid ${isFeed ? "" : "border-b border-line"}`
    }`}>
      <div className="flex h-14 items-center gap-1 px-2 pt-safe md:hidden">
        <IconButton icon={Menu} label="Open Home sections" data-tour="sections" onClick={openDrawer} tone={transparent ? "overlay" : "ghost"} />
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
        {section !== "rolls" && !workAccount && (
          // Rolls get their own button: an orange dot while one is shooting, accent when one has developed.
          <span className="relative">
            <IconButton icon={Aperture} label={rollsDot === "new" ? "Rolls, one has developed" : rollsDot === "live" ? "Rolls, one is shooting" : "Rolls"}
              data-tour="rolls" onClick={() => navigate("/rolls")} tone={transparent ? "overlay" : "ghost"} />
            {rollsDot && (
              <span aria-hidden="true" className={`pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-canvas ${rollsDot === "new" ? "bg-accent" : "bg-[#ff9b2f]"}`} />
            )}
          </span>
        )}
        {section !== "search" && (
          <IconButton icon={Search} label="Search" data-tour="search" onClick={() => navigate("/search")} tone={transparent ? "overlay" : "ghost"} />
        )}
        {guest ? (
          <button type="button" onClick={() => navigate(authPath("login"))} data-tour="login"
            className={`press ml-1 mr-1 min-h-9 shrink-0 rounded-full px-3.5 text-callout font-semibold ${
              transparent ? "bg-white/15 text-white" : "bg-surface-2 text-fg"
            }`}>
            Log in
          </button>
        ) : section !== "notifications" && (
          <span className="relative" data-tour="notifications">
            <IconButton icon={Bell} label={noticesUnread > 0 ? `Notifications, ${noticesUnread} new` : "Notifications"}
              onClick={() => navigate("/notifications")} tone={transparent ? "overlay" : "ghost"} />
            {noticesUnread > 0 && (
              <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-canvas" />
            )}
          </span>
        )}
        {actions}
        {!guest && !workAccount && <IconButton icon={Plus} label="Create" data-tour="create" onClick={() => openComposer()} tone={transparent ? "overlay" : "ghost"} />}
      </div>

      {isFeed ? (
        <div className="hidden md:block"><h1 className="sr-only">Home</h1></div>
      ) : (
        <div className="hidden md:flex min-h-16 items-center gap-4 px-6">
          <div className="min-w-0 flex-1 py-3">
            <h1 className="text-title-2">{meta.label}</h1>
          </div>
          {actions}
        </div>
      )}

      {children}
    </header>
  );
}
