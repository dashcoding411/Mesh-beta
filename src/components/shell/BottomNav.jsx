import { useEffect, useState } from "react";
import { House, MessageCircle } from "lucide-react";
import { navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";
import Avatar from "../ui/Avatar";

/* Phones get exactly three tabs, always: Home, Messages, Account. Everything
   else hangs off Home's sidebar, so this bar never grows past what a thumb
   reaches comfortably.

   It steps aside in one situation: while the on-screen keyboard is up.
   Otherwise the bar sits on top of the keyboard and eats a third of the space
   you're typing into. It comes back the moment the keyboard goes. */
export default function BottomNav({ page, profile, unread, immersive }) {
  const keyboardUp = useKeyboardOpen();
  if (keyboardUp) return null;

  const tap = (tab, path) => {
    // The tab you're already on: at its top level, scroll up or refresh;
    // deeper in (a chat, Settings), go back up to the top level.
    if (page.tab === tab && window.location.pathname === path) return scrollOrRefresh();
    navigate(path);
  };

  const tabs = [
    { id: "home", label: "Home", path: "/", icon: House },
    { id: "messages", label: "Messages", path: "/messages", icon: MessageCircle, badge: unread },
    { id: "account", label: "Account", path: "/account" },
  ];

  return (
    <nav aria-label="Main" data-theme={immersive ? "dark" : undefined}
      className={`md:hidden shrink-0 border-t pb-safe ${
        immersive ? "border-white/10 bg-black" : "border-line bg-canvas/95 backdrop-blur"
      }`}>
      <ul className="grid h-14 grid-cols-3">
        {tabs.map((t) => {
          const active = page.tab === t.id;
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

/* The visual viewport shrinks when the on-screen keyboard opens; the layout
   viewport doesn't. A drop of more than a quarter means a keyboard. */
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
