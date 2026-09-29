
import { MessageCircle, Plus, Settings } from "lucide-react";
import { HOME_SECTIONS, sidebarSection } from "../../lib/surfaces";
import { navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";
import Avatar from "../ui/Avatar";

/* Desktop navigation. Two widths: an icon rail between 768 and 1280px so
   the content keeps its room, and the full labelled sidebar above that.
   Home's five sections come first (Search, For you, Flicks, Circles, News), then
   Messages; Create and your account anchor the bottom. */
export default function Sidebar({ page, profile, unread, onCreate }) {
  const current = page.tab === "home" ? sidebarSection(page.section) : null;

  return (
    <aside aria-label="Main" className="hidden md:flex w-[76px] xl:w-64 shrink-0 flex-col border-r border-line bg-canvas px-3 py-4">
      <button type="button" onClick={() => navigate("/")} aria-label="Mesh home"
        className="press mb-5 flex h-11 items-center gap-2.5 rounded-control px-2.5 xl:px-3">
        <LogoMark />
        <span className="hidden xl:inline font-display text-title-2 font-extrabold tracking-tight">Mesh</span>
      </button>

      <nav aria-label="Home sections" className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
        {HOME_SECTIONS.map((s) => (
          <NavRow key={s.id} icon={s.icon} label={s.label} active={current === s.id}
            onClick={() => (window.location.pathname === s.path ? scrollOrRefresh() : navigate(s.path))} />
        ))}

        <div className="my-3 h-px bg-line" aria-hidden="true" />

        <NavRow icon={MessageCircle} label="Messages" active={page.tab === "messages"}
          onClick={() => navigate("/messages")} badge={unread} />
      </nav>

      <button type="button" onClick={onCreate}
        className="press mt-4 flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent font-semibold text-white hover:bg-accent-hover">
        <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
        <span className="hidden xl:inline">Create</span>
        <span className="sr-only xl:hidden">Create</span>
      </button>

      <div className="mt-3 flex items-center gap-1">
        <button type="button" onClick={() => navigate("/account")}
          aria-current={page.tab === "account" && page.view === "profile" ? "page" : undefined}
          className={`press flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-surface-2 ${
            page.tab === "account" ? "bg-surface-2" : ""
          } justify-center xl:justify-start`}>
          <Avatar profile={profile} size={32} />
          <span className="hidden xl:block min-w-0">
            <span className="block truncate text-callout font-semibold text-fg">{profile.name || profile.username}</span>
            <span className="block truncate text-caption text-fg-subtle">@{profile.username}</span>
          </span>
          <span className="sr-only xl:hidden">Account</span>
        </button>
        <button type="button" onClick={() => navigate("/account/settings")} aria-label="Settings" title="Settings"
          className="press hidden xl:flex h-11 w-11 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function NavRow({ icon: Icon, label, active, onClick, badge = 0 }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} unread` : undefined} title={label}
      className={`press relative flex min-h-11 w-full items-center gap-3.5 rounded-control px-3 text-body transition-colors ${
        active ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"
      } justify-center xl:justify-start`}>
      <Icon size={22} strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
      <span className="hidden xl:inline">{label}</span>
      {badge > 0 && (
        <span aria-hidden="true"
          className="absolute left-7 top-1.5 xl:static xl:ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-label font-bold text-white tabular">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

/** The Mesh mark: threads crossing, the same as the favicon. */
export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="16" fill="#18181c" />
      <g stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M16 22h32M16 32h32M16 42h32" />
        <path d="M22 16v32M32 16v32M42 16v32" />
      </g>
    </svg>
  );
}
