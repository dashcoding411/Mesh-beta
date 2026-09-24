import { Settings, Scale, ChevronRight } from "lucide-react";
import Dialog from "../ui/Dialog";
import Avatar from "../ui/Avatar";
import { HOME_SECTIONS } from "../../lib/surfaces";
import { navigate } from "../../lib/router";

/* Home's sidebar on phones. Every section of Home is one tap from here, each
   with a line saying what it is, so nobody has to guess what "Circles" means. */
export default function HomeDrawer({ page, profile, onClose }) {
  const go = (path) => { onClose(); navigate(path); };

  return (
    <Dialog title="Browse Mesh" variant="drawer" onClose={onClose} bodyClassName="!px-3">
      <button type="button" onClick={() => go("/account")}
        className="press mb-4 flex w-full items-center gap-3 rounded-card bg-surface-2 p-3 text-left">
        <Avatar profile={profile} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-semibold">{profile.name || profile.username}</span>
          <span className="block truncate text-caption text-fg-subtle">@{profile.username}</span>
        </span>
        <ChevronRight size={18} className="text-fg-subtle" aria-hidden="true" />
      </button>

      <nav aria-label="Home sections">
        <ul className="space-y-1">
          {HOME_SECTIONS.map((s) => {
            const active = page.tab === "home" && page.section === s.id;
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => go(s.path)} aria-current={active ? "page" : undefined}
                  className={`press flex min-h-14 w-full items-center gap-3.5 rounded-control px-3 text-left transition-colors ${
                    active ? "bg-accent-soft" : "hover:bg-surface-2"
                  }`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    active ? "bg-accent text-white" : "bg-surface-2 text-fg-muted"
                  }`}>
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-body ${active ? "font-semibold text-fg" : "font-medium text-fg"}`}>{s.label}</span>
                    <span className="line-clamp-2 block text-caption text-fg-subtle">{s.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="my-4 h-px bg-line" aria-hidden="true" />

      <ul className="space-y-1">
        <li>
          <button type="button" onClick={() => go("/account/settings")}
            className="press flex min-h-12 w-full items-center gap-3.5 rounded-control px-3 text-callout text-fg-muted hover:bg-surface-2 hover:text-fg">
            <Settings size={20} aria-hidden="true" /> Settings
          </button>
        </li>
        <li>
          <button type="button" onClick={() => go("/legal")}
            className="press flex min-h-12 w-full items-center gap-3.5 rounded-control px-3 text-callout text-fg-muted hover:bg-surface-2 hover:text-fg">
            <Scale size={20} aria-hidden="true" /> Privacy, terms &amp; policies
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
