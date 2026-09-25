import { ChevronRight } from "lucide-react";
import Dialog from "../ui/Dialog";
import Avatar from "../ui/Avatar";
import { HOME_SECTIONS, sidebarSection } from "../../lib/surfaces";
import { navigate } from "../../lib/router";

/* Home's sidebar on phones: Search, For you, Flicks and Circles, each with a
   line saying what it is, so nobody has to guess what "Circles" means.
   Settings and policies live behind Account. */
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
            const active = page.tab === "home" && sidebarSection(page.section) === s.id;
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

    </Dialog>
  );
}
