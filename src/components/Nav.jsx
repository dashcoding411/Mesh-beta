import { useState, useRef, useEffect } from "react";
import { SURFACES } from "../lib/surfaces";

/* Names are our own — "Shorts" is YouTube's, "Groups" is Facebook's, and
   "Posts" says nothing. The film metaphor pairs Flicks (quick) with Features
   (long), and Circles/Sourced describe what they actually do. */

// Grouped so the rail reads as three short lists instead of one long one.
// Home, Search and Chat sit at the top — they're the three things people
// reach for constantly. Everything else follows, grouped by kind.
const SECTIONS = [
  ["weave", "discover", "chats"],
  ["flicks", "features", "stills"],
  ["circles", "sourced"],
];

const MOBILE_TABS = ["weave", "flicks", "create", "chats", "profile"];

export default function Nav({ tab, onTab, onCreate, profile }) {
  // Flicks is a full-screen surface on phones, so the chrome gets out of the way.
  const immersive = tab === "flicks";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const item = (id, active) =>
    `w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
      active
        ? "bg-violet-600/20 text-violet-200"
        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
    }`;

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-zinc-800/80 px-3 py-4">
        <div className="px-2 mb-6">
          <div className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Mesh
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar space-y-4">
          {SECTIONS.map((section, i) => (
            <div key={i} className="space-y-0.5">
              {section.map((id) => (
                <button key={id} onClick={() => onTab(id)} className={item(id, tab === id)}
                  aria-current={tab === id ? "page" : undefined}>
                  <span className="w-4 text-center text-base leading-none opacity-90">{SURFACES[id].icon}</span>
                  {SURFACES[id].label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <button onClick={onCreate}
          className="mt-4 min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 font-semibold text-sm shadow-lg shadow-violet-900/30">
          Create
        </button>

        {/* Profile and Account collapse into one avatar menu */}
        <div className="relative mt-3" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu" aria-expanded={menuOpen}
            className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-zinc-900 transition text-left">
            <Avatar profile={profile} size={7} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-zinc-200 truncate">{profile.name || profile.username}</span>
              <span className="block text-[11px] text-zinc-500 truncate">@{profile.username}</span>
            </span>
            <span className="text-zinc-600 text-xs">▾</span>
          </button>

          {menuOpen && (
            <div role="menu"
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1 shadow-xl anim-pop">
              {["profile", "account"].map((id) => (
                <button key={id} role="menuitem"
                  onClick={() => { setMenuOpen(false); onTab(id); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 text-left">
                  <span className="w-4 text-center opacity-90">{SURFACES[id].icon}</span>
                  {SURFACES[id].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile chrome. Flicks goes full-bleed like TikTok — no top bar, and
          the tab bar floats transparently over the video. Everywhere else gets
          the Instagram treatment: wordmark left, utilities right. */}
      {!immersive && (
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-zinc-800/80">
          <span className="text-2xl font-black bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Mesh
          </span>
          <div className="flex items-center gap-1">
            {["stills", "features", "circles", "sourced"].map((id) => (
              <button key={id} onClick={() => onTab(id)} aria-label={SURFACES[id].label}
                className={`h-10 w-10 rounded-full text-base flex items-center justify-center transition ${
                  tab === id ? "bg-violet-600/20 text-violet-200" : "text-zinc-300 active:bg-zinc-900"
                }`}>
                {SURFACES[id].icon}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile tab bar */}
      <nav className={`md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center h-[58px] pb-[env(safe-area-inset-bottom)] ${
        immersive
          ? "bg-gradient-to-t from-black via-black/80 to-transparent"
          : "border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur"
      }`}>
        {MOBILE_TABS.map((id) =>
          id === "create" ? (
            <button key={id} onClick={onCreate} aria-label="Create"
              className="flex-1 flex items-center justify-center">
              {/* TikTok's create button: wide, bright, unmistakable */}
              <span className="relative h-8 w-12 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-violet-900/40">
                +
              </span>
            </button>
          ) : (
            <button key={id} onClick={() => onTab(id)} aria-label={SURFACES[id].label}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-0.5 transition ${
                tab === id ? "text-white" : immersive ? "text-white/60" : "text-zinc-500"
              }`}>
              <span className="text-lg leading-none">{SURFACES[id].icon}</span>
              <span className="text-[10px] leading-none">{SURFACES[id].label}</span>
              {tab === id && <span className="h-0.5 w-5 rounded-full bg-white" />}
            </button>
          )
        )}
      </nav>
    </>
  );
}

const AVATAR_SIZES = {
  7: "h-7 w-7 text-xs",
  9: "h-9 w-9 text-sm",
  12: "h-12 w-12 text-lg",
  16: "h-16 w-16 text-2xl",
};

export function Avatar({ profile, size = 9, className = "" }) {
  const s = AVATAR_SIZES[size] || AVATAR_SIZES[9];
  if (profile?.photoURL) {
    return <img src={profile.photoURL} alt="" className={`${s} rounded-full object-cover shrink-0 ${className}`} />;
  }
  const seed = profile?.name || profile?.username || profile?.authorDisplayName || profile?.authorName || "?";
  return (
    <div className={`${s} rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold shrink-0 ${className}`}>
      {seed[0]?.toUpperCase()}
    </div>
  );
}
