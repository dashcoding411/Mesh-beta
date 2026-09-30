import { useEffect, useState } from "react";
import { House, LogIn, MessageCircle, Search } from "lucide-react";
import { authPath, navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";
import Avatar from "../ui/Avatar";

// Mobile tab bar (Home, Messages, Account; signed out: Home, Search, Log in).
// Hidden while the on-screen keyboard is open.
export default function BottomNav({ page, profile, unread, immersive }) {
  const keyboardUp = useKeyboardOpen();
  if (keyboardUp) return null;

  const tap = (tab, path) => {
    // Re-tapping the active tab: scroll/refresh at its root, else pop to the root.
    if (page.tab === tab && window.location.pathname === path) return scrollOrRefresh();
    navigate(path);
  };

  const tabs = profile ? [
    { id: "home", label: "Home", path: "/", icon: House },
    { id: "messages", label: "Messages", path: "/messages", icon: MessageCircle, badge: unread },
    { id: "account", label: "Account", path: "/account" },
  ] : [
    { id: "home", label: "Home", path: "/", icon: House },
    { id: "search", label: "Search", path: "/search", icon: Search },
    { id: "auth", label: "Log in", path: authPath("login"), icon: LogIn },
  ];
  const isActive = (id) => (id === "search" ? page.section === "search" : id === "home" ? page.tab === "home" && page.section !== "search" : page.tab === id);

  return (
    <nav aria-label="Main" data-theme={immersive ? "dark" : undefined}
      className={`md:hidden shrink-0 border-t pb-safe ${
        immersive ? "border-white/10 bg-black" : "border-line bg-canvas/95 backdrop-blur"
      }`}>
      <ul className="grid h-14 grid-cols-3">
        {tabs.map((t) => {
          const active = isActive(t.id);
          const Icon = t.icon;
          return (
            <li key={t.id} className="flex">
              <button type="button" onClick={() => tap(t.id, t.path)}
                aria-current={active ? "page" : undefined}
                aria-label={t.badge > 0 ? `${t.label}, ${t.badge} unread` : t.label}
                className={`press relative flex flex-1 flex-col items-center justify-center gap-0.5 ${
                  active ? "text-fg" : immersive ? "text-white/65" : "text-fg-subtle"
                }`}>
                {Icon ? (
                  <Icon size={24} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true"
                    fill={active && t.id === "home" ? "currentColor" : "none"} />
                ) : (
                  <span className={`rounded-full ${active ? "ring-2 ring-fg ring-offset-1 ring-offset-canvas" : ""}`}>
                    <Avatar profile={profile} size={24} />
                  </span>
                )}
                <span className={`text-label ${active ? "font-semibold" : "font-medium"}`} aria-hidden="true">{t.label}</span>
                {t.badge > 0 && (
                  <span aria-hidden="true"
                    className="absolute left-1/2 top-1 ml-2 min-w-5 rounded-full bg-accent px-1.5 text-center text-label font-bold leading-5 text-white tabular ring-2 ring-canvas">
                    {t.badge > 9 ? "9+" : t.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Keyboard heuristic: visual viewport more than 25% shorter than the layout viewport.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const check = () => setOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);
  return open;
}
