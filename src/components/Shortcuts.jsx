import { useEffect, useState } from "react";
import { navigate } from "../lib/router";
import { motionReduced } from "../lib/appearance";
import Dialog from "./ui/Dialog";

const KEYS = [
  { keys: ["n"], label: "New post" },
  { keys: ["/"], label: "Search" },
  { keys: ["j"], label: "Next post" },
  { keys: ["k"], label: "Previous post" },
  { keys: ["g", "h"], label: "Home" },
  { keys: ["g", "m"], label: "Messages" },
  { keys: ["g", "f"], label: "Flicks" },
  { keys: ["g", "p"], label: "Your profile" },
  { keys: ["Esc"], label: "Close or go back" },
  { keys: ["?"], label: "Show these shortcuts" },
];

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// Single-key shortcuts; ignored while typing, with modifiers, or with a dialog open.
export default function Shortcuts({ onCreate }) {
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let pendingG = 0;
    const move = (dir) => {
      const posts = [...document.querySelectorAll("#mesh-main article")];
      if (!posts.length) return;
      const focused = posts.indexOf(document.activeElement);
      let target;
      if (focused !== -1) target = posts[focused + dir];
      else {
        const top = document.getElementById("mesh-main").getBoundingClientRect().top + 60;
        const i = posts.findIndex((p) => p.getBoundingClientRect().top > top + 2);
        const next = i === -1 ? posts.length : i;
        target = dir > 0 ? posts[next] : posts[Math.max(0, next - 1)];
      }
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: motionReduced() ? "auto" : "smooth" });
      target.focus({ preventScroll: true });
    };
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (document.querySelector("[aria-modal=true]")) return;
      const k = e.key;
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const to = { h: "/", m: "/messages", f: "/flicks", p: "/account" }[k.toLowerCase()];
        if (to) { e.preventDefault(); navigate(to); }
        return;
      }
      if (k === "g") { pendingG = Date.now(); return; }
      if (k === "n") { e.preventDefault(); onCreate(); }
      else if (k === "/") {
        e.preventDefault();
        if (window.location.pathname === "/search") document.getElementById("mesh-search")?.focus();
        else navigate("/search");
      } else if (k === "j") { e.preventDefault(); move(1); }
      else if (k === "k") { e.preventDefault(); move(-1); }
      else if (k === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCreate]);

  if (!help) return null;
  return (
    <Dialog title="Keyboard shortcuts" variant="center" size="sm" onClose={() => setHelp(false)}>
      <dl className="divide-y divide-line">
        {KEYS.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-callout text-fg">{s.label}</dt>
            <dd className="flex items-center gap-1.5 text-caption text-fg-subtle">
              {s.keys.map((key, i) => (
                <span key={key} className="flex items-center gap-1.5">
                  {i > 0 && <span>then</span>}
                  <kbd className="min-w-7 rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center font-sans text-label font-semibold text-fg">{key}</kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-caption text-fg-subtle">Shortcuts pause while you're typing or a window like this one is open.</p>
    </Dialog>
  );
}
