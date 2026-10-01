import { useEffect, useId, useRef, useState } from "react";
import { Plus, Menu, LogIn, UserPlus } from "lucide-react";
import { authPath, navigate } from "../../lib/router";
import { MAIN_NAV, MORE_NAV, activeNavId, navFor } from "./navItems";
import Avatar from "../ui/Avatar";
import { scrollOrRefresh } from "./scrollOrRefresh";

// Desktop nav: icon rail at md, labelled column at xl.
export default function Sidebar({ page, profile, unread, notifications, onCreate }) {
  const guest = !profile;
  const current = activeNavId(page);
  const counts = { unread, notifications };
  const go = (path) => (window.location.pathname === path ? scrollOrRefresh() : navigate(path));

  return (
    <aside aria-label="Main" className="hidden md:flex w-[76px] xl:w-64 shrink-0 flex-col border-r border-line bg-canvas px-3 py-5">
      <button type="button" onClick={() => navigate("/")} aria-label="Mesh home"
        className="press flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-control px-2.5 xl:justify-start xl:px-3">
        <LogoMark />
        <span className="hidden xl:inline font-display text-title-2 font-extrabold tracking-tight">Mesh</span>
      </button>

      <nav aria-label="Main sections" className="flex min-h-0 flex-1 flex-col justify-center gap-1 overflow-y-auto py-4 no-scrollbar">
        {navFor(MAIN_NAV, guest).map((s) => (
          <NavRow key={s.id} tour={`nav-${s.id}`} icon={s.icon} label={s.label} badge={counts[s.badge] || 0} active={current === s.id} onClick={() => go(s.path)} />
        ))}
        {guest ? (
          <>
            <NavRow icon={LogIn} label="Log in" onClick={() => navigate(authPath("login"))} />
            <NavRow tour="login" icon={UserPlus} label="Sign up" onClick={() => navigate(authPath("signup"))} />
          </>
        ) : (
          <>
            <NavRow tour="create" icon={Plus} label="Create" onClick={onCreate} />
            <button type="button" onClick={() => navigate("/account")} title="Profile" data-tour="profile"
              aria-current={page.tab === "account" && page.view === "profile" ? "page" : undefined}
              className={`press flex min-h-12 w-full items-center gap-3.5 rounded-control px-3 text-body transition-colors justify-center xl:justify-start ${
                page.tab === "account" && page.view === "profile" ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"
              }`}>
              <Avatar profile={profile} size={26} ring={page.tab === "account" && page.view === "profile"} />
              <span className="hidden xl:inline">Profile</span>
              <span className="sr-only xl:hidden">Profile</span>
            </button>
          </>
        )}
      </nav>

      <MoreMenu page={page} guest={guest} />
    </aside>
  );
}

function NavRow({ icon: Icon, label, active = false, onClick, badge = 0, tour }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} data-tour={tour}
      aria-label={badge > 0 ? `${label}, ${badge} new` : undefined} title={label}
      className={`press relative flex min-h-12 w-full items-center gap-3.5 rounded-control px-3 text-body transition-colors ${
        active ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"
      } justify-center xl:justify-start`}>
      <Icon size={24} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className="hidden xl:inline">{label}</span>
      <span className="sr-only xl:hidden">{label}</span>
      {badge > 0 && (
        <span aria-hidden="true"
          className="absolute left-8 top-1.5 min-w-5 rounded-full bg-danger px-1.5 text-center text-label font-bold leading-5 text-white tabular ring-2 ring-canvas xl:static xl:ml-auto xl:ring-0">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function MoreMenu({ page, guest }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const entries = navFor(MORE_NAV, guest).map((m) => ({ label: m.label, icon: m.icon, run: () => navigate(m.path) }));

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector("[role=menuitem]")?.focus();
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = [...wrap.current.querySelectorAll("[role=menuitem]")];
        const i = list.indexOf(document.activeElement);
        list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const inSettings = ["settings", "brick", "saved", "leaderboard"].includes(activeNavId(page));
  return (
    <div ref={wrap} className="relative shrink-0">
      {open && (
        <div role="menu" aria-label="More" className="absolute bottom-full left-0 z-sheet mb-2 w-60 rounded-card border border-line bg-surface p-1.5 shadow-overlay anim-rise">
          {entries.map(({ label, icon: Icon, run }) => (
            <button key={label} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { setOpen(false); run(); }}
              className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-callout text-fg hover:bg-surface-2 focus:bg-surface-2">
              <Icon size={20} className="text-fg-muted" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
      <button ref={button} type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="More" data-tour="more"
        className={`press flex min-h-12 w-full items-center gap-3.5 rounded-control px-3 text-body transition-colors justify-center xl:justify-start ${
          open || inSettings ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"
        }`}>
        <Menu size={24} strokeWidth={1.9} aria-hidden="true" />
        <span className="hidden xl:inline">More</span>
        <span className="sr-only xl:hidden">More</span>
      </button>
    </div>
  );
}

export function LogoMark({ size = 28 }) {
  // Unique gradient id per instance: a shared id breaks every copy when the
  // first one is inside a display:none subtree.
  const gradient = `mesh-mark-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#18181c" />
      <g stroke={`url(#${gradient})`} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M16 22h32M16 32h32M16 42h32" />
        <path d="M22 16v32M32 16v32M42 16v32" />
      </g>
    </svg>
  );
}
