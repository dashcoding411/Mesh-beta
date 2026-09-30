import { Plus } from "lucide-react";
import Dialog from "../ui/Dialog";
import Avatar from "../ui/Avatar";
import { navigate } from "../../lib/router";
import { LogoMark } from "./Sidebar";
import { MAIN_NAV, MORE_NAV, activeNavId } from "./navItems";

// Mobile counterpart of Sidebar, driven by the same nav items.
export default function HomeDrawer({ page, profile, unread = 0, notifications = 0, onCreate, onClose }) {
  const current = activeNavId(page);
  const counts = { unread, notifications };
  const go = (path) => { onClose(); navigate(path); };

  return (
    <Dialog variant="drawer" onClose={onClose} bodyClassName="!px-3 !pb-3 flex flex-col"
      title={
        <span className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-display text-title-2 font-extrabold tracking-tight">Mesh</span>
        </span>
      }>

      <nav aria-label="Main sections" className="flex min-h-0 flex-1 flex-col justify-center py-4">
        <ul className="space-y-1">
          {MAIN_NAV.map((s) => (
            <li key={s.id}>
              <Row icon={s.icon} label={s.label} badge={counts[s.badge] || 0} active={current === s.id} onClick={() => go(s.path)} />
            </li>
          ))}
          <li><Row icon={Plus} label="Create" onClick={() => { onClose(); onCreate(); }} /></li>
          <li>
            <button type="button" onClick={() => go("/account")} aria-current={current === "profile" ? "page" : undefined}
              className={`press flex min-h-12 w-full items-center gap-4 rounded-control px-3 text-left text-body transition-colors ${
                current === "profile" ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}>
              <Avatar profile={profile} size={26} ring={current === "profile"} />
              <span className="min-w-0 flex-1 truncate">Profile <span className="text-caption text-fg-subtle">@{profile.username}</span></span>
            </button>
          </li>
        </ul>
      </nav>

      <nav aria-label="More" className="shrink-0 border-t border-line pt-2">
        <ul className="grid grid-cols-4 gap-1">
          {MORE_NAV.map(({ id, label, icon: Icon, path }) => (
            <li key={id}>
              <button type="button" onClick={() => go(path)} aria-current={current === id ? "page" : undefined}
                className={`press flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-control text-label font-medium transition-colors ${
                  current === id ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                }`}>
                <Icon size={20} aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </Dialog>
  );
}

function Row({ icon: Icon, label, badge = 0, active = false, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} new` : undefined}
      className={`press flex min-h-12 w-full items-center gap-4 rounded-control px-3 text-left text-body transition-colors ${
        active ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}>
      <Icon size={24} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      {badge > 0 && (
        <span aria-hidden="true" className="min-w-5 rounded-full bg-danger px-1.5 text-center text-label font-bold leading-5 text-white tabular">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
